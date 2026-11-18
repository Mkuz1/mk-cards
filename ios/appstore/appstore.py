"""Fills in the App Store Connect listing for MK Cards from metadata.json and uploads the screenshots.

Runs in GitHub Actions (workflow "App Store listing") with the App Store Connect API key in ASC_KEY_ID,
ASC_ISSUER_ID and ASC_KEY_P8. Optional: DEMO_PASSWORD, REVIEW_FIRST_NAME, REVIEW_LAST_NAME, REVIEW_PHONE,
REVIEW_EMAIL. It never submits the app for review.
"""
import functools
import glob
import hashlib
import json
import os
import sys
import time

import jwt
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(os.path.join(HERE, "metadata.json")))
API = "https://api.appstoreconnect.apple.com"
results = []


def token():
    now = int(time.time())
    return jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
                      os.environ["ASC_KEY_P8"], algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})


def call(method, path, body=None, ok=(200, 201, 204)):
    r = requests.request(method, API + path, json=body, headers={"Authorization": "Bearer " + token()}, timeout=60)
    if r.status_code not in ok:
        detail = ""
        if r.content:
            errs = r.json().get("errors", [])
            parts = [e.get("detail") or e.get("title", "") for e in errs]
            for e in errs:  # Apple lists the real reasons here when a submission is refused
                for key, items in (e.get("meta", {}).get("associatedErrors") or {}).items():
                    parts += [f"[{key.split('/')[-2] if '/' in key else key}] " + (x.get("detail") or x.get("code", "")) for x in items]
            detail = "; ".join(parts)
        raise RuntimeError(f"{method} {path.split('?')[0]} -> {r.status_code} {detail}")
    return r.json() if r.content else {}


def step(name):
    def wrap(fn):
        @functools.wraps(fn)
        def run(*a):
            try:
                out = fn(*a)
                results.append(("OK", name, out or ""))
                return out
            except Exception as e:  # keep going; report at the end
                results.append(("FAILED", name, str(e)[:400]))
        return run
    return wrap


app = call("GET", f"/v1/apps?filter[bundleId]={M['bundleId']}")["data"][0]
APP = app["id"]
print("App", APP, app["attributes"]["name"])


@step("Content rights")
def content_rights():
    call("PATCH", f"/v1/apps/{APP}", {"data": {"type": "apps", "id": APP, "attributes": {"contentRightsDeclaration": "DOES_NOT_USE_THIRD_PARTY_CONTENT"}}})


def editable_app_info():
    infos = call("GET", f"/v1/apps/{APP}/appInfos")["data"]
    for i in infos:
        if i["attributes"].get("appStoreState") in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "WAITING_FOR_REVIEW", None) \
                or i["attributes"].get("state") in ("PREPARE_FOR_SUBMISSION", "READY_FOR_DISTRIBUTION"):
            return i
    return infos[0]


INFO = editable_app_info()["id"]


@step("Categories")
def categories():
    call("PATCH", f"/v1/appInfos/{INFO}", {"data": {"type": "appInfos", "id": INFO, "relationships": {
        "primaryCategory": {"data": {"type": "appCategories", "id": M["primaryCategory"]}},
        "secondaryCategory": {"data": {"type": "appCategories", "id": M["secondaryCategory"]}}}}})


@step("Name, subtitle, privacy policy URL")
def info_localization():
    locs = call("GET", f"/v1/appInfos/{INFO}/appInfoLocalizations")["data"]
    loc = next(l for l in locs if l["attributes"]["locale"] == M["locale"])
    call("PATCH", f"/v1/appInfoLocalizations/{loc['id']}", {"data": {"type": "appInfoLocalizations", "id": loc["id"], "attributes": {
        "name": M["name"], "subtitle": M["subtitle"], "privacyPolicyUrl": M["privacyPolicyUrl"]}}})


BOOL_ANSWERS = {"advertising", "gambling", "lootBox", "messagingAndChat", "parentalControls", "ageAssurance", "unrestrictedWebAccess",
                "userGeneratedContent", "healthOrWellnessTopics", "socialMedia", "socialMediaAgeRestricted"}
SKIP_ANSWERS = {"kidsAgeBand", "ageRatingOverride", "ageRatingOverrideV2", "koreaAgeRatingOverride", "developerAgeRatingInfoUrl",
                "gracRatingClassificationNumber"}


@step("Age rating (no objectionable content: 4+)")
def age_rating():
    decl = call("GET", f"/v1/appInfos/{INFO}/ageRatingDeclaration")["data"]
    did = decl["id"]
    attrs = {}
    for key, value in decl["attributes"].items():
        if key in SKIP_ANSWERS:
            continue
        attrs[key] = False if (isinstance(value, bool) or key in BOOL_ANSWERS) else "NONE"
    try:
        call("PATCH", f"/v1/ageRatingDeclarations/{did}", {"data": {"type": "ageRatingDeclarations", "id": did, "attributes": attrs}})
    except RuntimeError as first:
        # Learn which answers are yes/no from Apple's reply, flip them and try once more.
        text = str(first)
        for key in list(attrs):
            if key in text:
                attrs[key] = False if attrs[key] == "NONE" else "NONE"
        call("PATCH", f"/v1/ageRatingDeclarations/{did}", {"data": {"type": "ageRatingDeclarations", "id": did, "attributes": attrs}})
    return f"{len(attrs)} answers: none of the listed content"


# The version being prepared: one that can be edited, or one waiting for review (which "withdraw" can take back).
OPEN_STATES = ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "WAITING_FOR_REVIEW", "IN_REVIEW")


def version():
    vs = call("GET", f"/v1/apps/{APP}/appStoreVersions?filter[platform]=IOS&limit=10")["data"]
    editable = [v for v in vs if v["attributes"].get("appStoreState") in OPEN_STATES or v["attributes"].get("appVersionState") in OPEN_STATES]
    if not editable:
        raise SystemExit("No editable App Store version found.")
    return editable[0]


VER = version()
VID = VER["id"]


@step("Withdraw the version waiting for review")
def withdraw():
    """Takes a version that is waiting for (or in) review back, as "Remove from review" does, so it can be changed."""
    subs = call("GET", f"/v1/reviewSubmissions?filter[app]={APP}&filter[platform]=IOS&limit=20")["data"]
    waiting = [x["id"] for x in subs if x["attributes"].get("state") in ("WAITING_FOR_REVIEW", "IN_REVIEW")]
    if not waiting:
        return "nothing was waiting for review"
    for sid in waiting:
        call("PATCH", f"/v1/reviewSubmissions/{sid}", {"data": {"type": "reviewSubmissions", "id": sid, "attributes": {"canceled": True}}})
    for _ in range(40):  # Apple takes a little while to finish cancelling
        time.sleep(15)
        state = call("GET", f"/v1/appStoreVersions/{VID}")["data"]["attributes"]
        current = state.get("appStoreState") or state.get("appVersionState")
        print("version state:", current, flush=True)
        if current not in ("WAITING_FOR_REVIEW", "IN_REVIEW"):
            return f"withdrawn; version is now {current}"
    raise RuntimeError("Apple is still cancelling the review; run this again in a few minutes.")


@step("Version number, copyright, release after approval")
def version_attributes():
    call("PATCH", f"/v1/appStoreVersions/{VID}", {"data": {"type": "appStoreVersions", "id": VID, "attributes": {
        "versionString": M["versionString"], "copyright": M["copyright"], "releaseType": "AFTER_APPROVAL"}}})


def version_localization():
    locs = call("GET", f"/v1/appStoreVersions/{VID}/appStoreVersionLocalizations")["data"]
    return next(l for l in locs if l["attributes"]["locale"] == M["locale"])


LOC = version_localization()["id"]


@step("Description, keywords, promotional text, support and marketing URLs")
def texts():
    call("PATCH", f"/v1/appStoreVersionLocalizations/{LOC}", {"data": {"type": "appStoreVersionLocalizations", "id": LOC, "attributes": {
        "description": M["description"], "keywords": M["keywords"], "promotionalText": M["promotionalText"],
        "supportUrl": M["supportUrl"], "marketingUrl": M["marketingUrl"]}}})


@step("Screenshots (6.9-inch iPhone)")
def screenshots():
    sets = call("GET", f"/v1/appStoreVersionLocalizations/{LOC}/appScreenshotSets")["data"]
    target = next((s for s in sets if s["attributes"]["screenshotDisplayType"] == M["screenshotDisplayType"]), None)
    if target is None:
        target = call("POST", "/v1/appScreenshotSets", {"data": {"type": "appScreenshotSets",
            "attributes": {"screenshotDisplayType": M["screenshotDisplayType"]},
            "relationships": {"appStoreVersionLocalization": {"data": {"type": "appStoreVersionLocalizations", "id": LOC}}}}})["data"]
    sid = target["id"]
    for old in call("GET", f"/v1/appScreenshotSets/{sid}/appScreenshots")["data"]:
        call("DELETE", f"/v1/appScreenshots/{old['id']}")
    files = sorted(glob.glob(os.path.join(HERE, "screenshots", "*.png")))
    for f in files:
        data = open(f, "rb").read()
        shot = call("POST", "/v1/appScreenshots", {"data": {"type": "appScreenshots",
            "attributes": {"fileName": os.path.basename(f), "fileSize": len(data)},
            "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": sid}}}}})["data"]
        for op in shot["attributes"]["uploadOperations"]:
            part = data[op["offset"]: op["offset"] + op["length"]]
            r = requests.request(op["method"], op["url"], data=part, headers={h["name"]: h["value"] for h in op.get("requestHeaders", [])}, timeout=120)
            r.raise_for_status()
        call("PATCH", f"/v1/appScreenshots/{shot['id']}", {"data": {"type": "appScreenshots", "id": shot["id"], "attributes": {
            "uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}})
    return f"{len(files)} uploaded"


@step("App Review information")
def review_detail():
    attrs = {"notes": M["reviewNotes"], "demoAccountName": M["demoAccountName"], "demoAccountRequired": True}
    if os.environ.get("DEMO_PASSWORD"):
        attrs["demoAccountPassword"] = os.environ["DEMO_PASSWORD"]
    for env, key in (("REVIEW_FIRST_NAME", "contactFirstName"), ("REVIEW_LAST_NAME", "contactLastName"),
                     ("REVIEW_PHONE", "contactPhone"), ("REVIEW_EMAIL", "contactEmail")):
        if os.environ.get(env):
            attrs[key] = os.environ[env]
    existing = call("GET", f"/v1/appStoreVersions/{VID}/appStoreReviewDetail", ok=(200, 404))
    if existing.get("data"):
        rid = existing["data"]["id"]
        call("PATCH", f"/v1/appStoreReviewDetails/{rid}", {"data": {"type": "appStoreReviewDetails", "id": rid, "attributes": attrs}})
    else:
        call("POST", "/v1/appStoreReviewDetails", {"data": {"type": "appStoreReviewDetails", "attributes": attrs,
            "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": VID}}}}})
    missing = [k for k in ("demoAccountPassword", "contactFirstName", "contactLastName", "contactPhone", "contactEmail") if k not in attrs]
    return "notes and demo account set" + (f"; still to fill in: {', '.join(missing)}" if missing else "")


@step("Price: free")
def price():
    points = call("GET", f"/v1/apps/{APP}/appPricePoints?filter[territory]=USA&limit=200")["data"]
    free = next(p for p in points if float(p["attributes"]["customerPrice"]) == 0)
    call("POST", "/v1/appPriceSchedules", {"data": {"type": "appPriceSchedules", "relationships": {
        "app": {"data": {"type": "apps", "id": APP}},
        "baseTerritory": {"data": {"type": "territories", "id": "USA"}},
        "manualPrices": {"data": [{"type": "appPrices", "id": "${free}"}]}}},
        "included": [{"type": "appPrices", "id": "${free}", "attributes": {"startDate": None},
                      "relationships": {"appPricePoint": {"data": {"type": "appPricePoints", "id": free["id"]}}}}]})


@step("Availability: all countries and regions")
def availability():
    territories = []
    path = "/v1/territories?limit=200"
    while path:
        page = call("GET", path)
        territories += [t["id"] for t in page["data"]]
        nxt = page.get("links", {}).get("next")
        path = nxt.replace(API, "") if nxt else None
    included = [{"type": "territoryAvailabilities", "id": f"${{t{i}}}", "attributes": {"available": True},
                 "relationships": {"territory": {"data": {"type": "territories", "id": t}}}} for i, t in enumerate(territories)]
    call("POST", "/v2/appAvailabilities", {"data": {"type": "appAvailabilities", "attributes": {"availableInNewTerritories": True},
        "relationships": {"app": {"data": {"type": "apps", "id": APP}},
                          "territoryAvailabilities": {"data": [{"type": "territoryAvailabilities", "id": x["id"]} for x in included]}}},
        "included": included})
    return f"{len(territories)} countries and regions"


@step("Attach the newest build")
def attach_build():
    """Waits for the most recently uploaded build of this version to finish processing, then attaches it."""
    deadline = time.time() + 45 * 60
    while True:
        builds = call("GET", f"/v1/builds?filter[app]={APP}&filter[preReleaseVersion.version]={M['versionString']}&sort=-uploadedDate&limit=5")["data"]
        if builds:
            newest = max(builds, key=lambda b: int(b["attributes"]["version"]))
            state = newest["attributes"]["processingState"]
            if state == "VALID":
                call("PATCH", f"/v1/appStoreVersions/{VID}/relationships/build", {"data": {"type": "builds", "id": newest["id"]}})
                return f"build {newest['attributes']['version']}"
            if state in ("FAILED", "INVALID"):
                raise RuntimeError(f"Apple could not process build {newest['attributes']['version']} ({state}).")
            print(f"Build {newest['attributes']['version']} is {state}; waiting…", flush=True)
        if time.time() > deadline:
            raise RuntimeError("The newest build is still processing; run this again later.")
        time.sleep(60)


@step("Status")
def status():
    builds = call("GET", f"/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=8&include=preReleaseVersion")
    rows = [f"{b['attributes']['version']}:{b['attributes']['processingState']}" for b in builds["data"]]
    v = call("GET", f"/v1/appStoreVersions/{VID}?include=build")
    attached = (v["data"]["relationships"]["build"].get("data") or {}).get("id")
    names = {b["id"]: b["attributes"]["version"] for b in builds["data"]}
    subs = call("GET", f"/v1/reviewSubmissions?filter[app]={APP}&limit=10")["data"]
    item_rows = []
    for sub in subs:
        items = call("GET", f"/v1/reviewSubmissions/{sub['id']}/items?include=appStoreVersion")["data"]
        item_rows += [f"{x['attributes'].get('state')}:{(x['relationships'].get('appStoreVersion', {}).get('data') or {}).get('id') == VID}" for x in items]
    rd = call("GET", f"/v1/appStoreVersions/{VID}/appStoreReviewDetail", ok=(200, 404)).get("data") or {}
    filled = [k for k in ("contactFirstName", "contactLastName", "contactPhone", "contactEmail", "demoAccountName", "demoAccountPassword")
              if (rd.get("attributes") or {}).get(k)]
    print("review detail filled:", filled, "| items:", item_rows, flush=True)
    return (f"builds {', '.join(rows)} | version {v['data']['attributes'].get('versionString')} "
            f"{v['data']['attributes'].get('appStoreState') or v['data']['attributes'].get('appVersionState')} attached={names.get(attached, attached)} | "
            f"submissions {', '.join(x['attributes'].get('state', '?') for x in subs)}")


@step("Resubmit for review")
def submit():
    subs = call("GET", f"/v1/reviewSubmissions?filter[app]={APP}&filter[platform]=IOS&limit=20")["data"]
    states = {x["id"]: x["attributes"].get("state") for x in subs}
    if any(st in ("WAITING_FOR_REVIEW", "IN_REVIEW") for st in states.values()):
        return "already waiting for review"
    notes = []
    # A submission left with unresolved issues cannot take the version again: cancel it (as "Cancel submission" in
    # App Store Connect does) and send a new one.
    for sid, st in states.items():
        if st == "UNRESOLVED_ISSUES":
            call("PATCH", f"/v1/reviewSubmissions/{sid}", {"data": {"type": "reviewSubmissions", "id": sid, "attributes": {"canceled": True}}})
            notes.append("cancelled the old submission")
    for _ in range(10):  # cancelling takes a moment
        subs = call("GET", f"/v1/reviewSubmissions?filter[app]={APP}&filter[platform]=IOS&limit=20")["data"]
        if not any(x["attributes"].get("state") in ("UNRESOLVED_ISSUES", "CANCELING") for x in subs):
            break
        time.sleep(6)
    ready = [x["id"] for x in subs if x["attributes"].get("state") == "READY_FOR_REVIEW"]
    sid = ready[0] if ready else call("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions",
        "attributes": {"platform": "IOS"}, "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})["data"]["id"]
    items = call("GET", f"/v1/reviewSubmissions/{sid}/items?include=appStoreVersion")["data"]
    if not any((x["relationships"].get("appStoreVersion", {}).get("data") or {}).get("id") == VID for x in items):
        call("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems", "relationships": {
            "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sid}},
            "appStoreVersion": {"data": {"type": "appStoreVersions", "id": VID}}}}})
        notes.append(f"added version {M['versionString']}")
    call("PATCH", f"/v1/reviewSubmissions/{sid}", {"data": {"type": "reviewSubmissions", "id": sid, "attributes": {"submitted": True}}})
    final = call("GET", f"/v1/reviewSubmissions/{sid}")["data"]["attributes"].get("state")
    return f"{final}; {', '.join(notes)}"


ONLY = set(filter(None, os.environ.get("ONLY", "").split(",")))
for fn in (withdraw, content_rights, categories, info_localization, age_rating, version_attributes, texts, screenshots, review_detail, price, availability, attach_build, status, submit):
    if fn.__name__ in ("submit", "status", "withdraw") and fn.__name__ not in ONLY:
        continue  # only when asked for by name
    if not ONLY or fn.__name__ in ONLY:
        fn()

print("\nSUMMARY")
for status, name, detail in results:
    print(f"{status:7} {name}{' — ' + detail if detail else ''}")
sys.exit(1 if any(s == "FAILED" for s, _, _ in results) else 0)
