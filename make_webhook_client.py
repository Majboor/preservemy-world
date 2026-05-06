#!/usr/bin/env python3
import argparse
import json
from urllib import request


def post_json(webhook_url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=120) as response:
        body = response.read().decode("utf-8")
        try:
            return response.status, json.loads(body)
        except json.JSONDecodeError:
            return response.status, body


def photos_from_urls(urls):
    return [{"url": url} for url in urls]


def build_payload(args):
    payload = {"action": args.action}
    if args.page_id:
        payload["page_id"] = args.page_id
    if args.post_id:
        payload["post_id"] = args.post_id
    if args.message:
        payload["message"] = args.message
    if args.limit:
        payload["limit"] = args.limit
    if args.image_url:
        payload["photos"] = photos_from_urls(args.image_url)
    return payload


def main():
    parser = argparse.ArgumentParser(description="Send JSON requests to the Make Facebook Pages webhook router.")
    parser.add_argument("webhook_url")
    parser.add_argument(
        "action",
        choices=[
            "get_all_posts",
            "get_posts_by_id",
            "get_specific_post",
            "get_post_reactions",
            "create_text_post",
            "create_single_image_post",
            "create_multi_image_post",
        ],
    )
    parser.add_argument("--page-id")
    parser.add_argument("--post-id")
    parser.add_argument("--message")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--image-url", action="append", help="Repeat this flag for multiple images.")
    args = parser.parse_args()

    status, body = post_json(args.webhook_url, build_payload(args))
    print(f"HTTP {status}")
    print(json.dumps(body, indent=2) if isinstance(body, (dict, list)) else body)


if __name__ == "__main__":
    main()
