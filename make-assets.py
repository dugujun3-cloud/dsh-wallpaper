#!/usr/bin/env python3
"""Build assets/catalog.json for dsh-wallpaper from the Wallhaven API.

The public build ships WITHOUT a bundled wallpaper library (all bundled art is
third-party and not redistributable). This script is the recommended way to
build your own personal library; the plugin also has in-app online search and
import, so running this is entirely optional.

Usage:
  # default: a small starter set (anime scenery, SFW)
  python3 make-assets.py

  # custom themes, more per theme
  python3 make-assets.py --query "sakura anime" --query "cyberpunk city" --per-theme 8

Prereq: python3 (macOS ships it). All results are SFW ("purity=100").
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
ASSET_DIR = os.path.join(BASE, "assets")
FULL_DIR = os.path.join(ASSET_DIR, "full")
THUMB_DIR = os.path.join(ASSET_DIR, "thumb")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

DEFAULT_QUERIES = ["anime scenery", "anime night sky", "anime japan"]
DEFAULT_LABELS = {"anime scenery": "风景", "anime night sky": "星空", "anime japan": "和风"}


def fetch(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
        f.write(r.read())


def sips(args):
    subprocess.run(["sips"] + args, check=True, capture_output=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", action="append", default=None, help="Wallhaven query, repeatable")
    ap.add_argument("--per-theme", type=int, default=4, help="images per theme (default 4)")
    args = ap.parse_args()

    queries = args.query or DEFAULT_QUERIES
    os.makedirs(FULL_DIR, exist_ok=True)
    os.makedirs(THUMB_DIR, exist_ok=True)

    items, seen = [], set()
    for q in queries:
        params = urllib.parse.urlencode({
            "q": q, "categories": "010", "purity": "100",
            "sorting": "toplist", "topRange": "1y", "atleast": "1920x1080",
            "ratios": "16x9,16x10", "page": "1",
        })
        url = "https://wallhaven.cc/api/v1/search?" + params
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
        n = 0
        label = DEFAULT_LABELS.get(q, q.split()[0] if q.split() else "主题")
        for d in data.get("data", []):
            if d["id"] in seen or d.get("file_type") not in ("image/jpeg", "image/png"):
                continue
            seen.add(d["id"])
            fid = d["id"]
            tmp = os.path.join(FULL_DIR, fid + ".orig")
            try:
                if not os.path.exists(os.path.join(FULL_DIR, fid + ".jpg")):
                    fetch(d["path"], tmp)
                    sips(["-Z", "2560", "-s", "format", "jpeg", "-s", "formatOptions", "72",
                          tmp, "--out", os.path.join(FULL_DIR, fid + ".jpg")])
                    os.remove(tmp)
                if not os.path.exists(os.path.join(THUMB_DIR, fid + ".jpg")):
                    sips(["-Z", "500", "-s", "format", "jpeg", "-s", "formatOptions", "68",
                          os.path.join(FULL_DIR, fid + ".jpg"),
                          "--out", os.path.join(THUMB_DIR, fid + ".jpg")])
            except Exception:
                if os.path.exists(tmp):
                    os.remove(tmp)
                continue
            items.append({
                "id": fid, "kind": "builtin", "name": "%s · %02d" % (label, n + 1),
                "theme": q.split()[0], "themeLabel": label,
                "tags": q.split(),
                "resolution": d.get("resolution", ""), "colors": [],
                "full": "/dsh-wallpaper/assets/full/%s.jpg" % fid,
                "thumb": "/dsh-wallpaper/assets/thumb/%s.jpg" % fid,
                "page": d["url"], "source": d.get("source") or d["url"],
                "bytes": os.path.getsize(os.path.join(FULL_DIR, fid + ".jpg")),
            })
            n += 1
            if n >= args.per_theme:
                break

    with open(os.path.join(ASSET_DIR, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump({"version": 1, "items": items}, f, ensure_ascii=False, indent=1)
    print("ok: %d wallpapers -> assets/catalog.json" % len(items))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("failed: %s" % e, file=sys.stderr)
        sys.exit(1)
