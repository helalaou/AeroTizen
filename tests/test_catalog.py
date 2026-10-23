from aerotizen import catalog


def _block(app_id, title, tizen_id, package, removable=1):
    fields = {
        "app_id": app_id,
        "app_title": title,
        "app_tizen_id": tizen_id,
        "app_package_name": package,
        "is_removable": removable,
        "app_size": 1048576 * 3,
        "use_count": 7,
    }
    lines = "".join(f"--------------{k:<36}={v}-------------\n" for k, v in fields.items())
    return "-" * 93 + "\n" + lines


SAMPLE = "apps count: 3\n" + "".join(
    [
        _block("111299001912", "YouTube", "9Ur5IzDKqV.TizenYouTube", "9Ur5IzDKqV"),
        _block("20252100001", "User Guide", "25emanual1.emanual", "25emanual1"),
        _block("3201907018807", "Netflix", "org.tizen.netflix-app", "org.tizen.netflix-app"),
    ]
)


def test_parses_block_format():
    apps = catalog.parse_applist(SAMPLE)
    assert [a["name"] for a in apps] == ["YouTube", "User Guide", "Netflix"]
    youtube = apps[0]
    assert youtube["pkgid"] == "9Ur5IzDKqV"
    assert youtube["removable"] is True
    assert youtube["size_mb"] == 3
    assert youtube["uses"] == 7


def test_classification():
    apps = {a["name"]: catalog.classify(a) for a in catalog.parse_applist(SAMPLE)}
    assert apps == {"YouTube": "optional", "User Guide": "bloat", "Netflix": "optional"}


def test_non_removable_and_infrastructure_are_protected():
    locked = catalog.parse_applist(_block("1", "Some App", "abcdefghij.App", "abcdefghij", removable=0))[0]
    assert catalog.classify(locked) == "protected"
    infra = {"appid": "ZODRT12q2l.WebAccountExtension", "pkgid": "ZODRT12q2l", "name": "WebAccount"}
    assert catalog.classify(infra) == "protected"
    own = {"appid": "DclHome001.Home", "pkgid": "DclHome001", "name": "AeroTizen", "removable": True}
    assert catalog.classify(own) == "protected"


def test_legacy_line_format_falls_back_to_store_pattern():
    apps = catalog.parse_applist("Jz7aUrV2Q4.Twitch\tTwitch\norg.tizen.settings\tSettings\n")
    assert {a["name"]: catalog.classify(a) for a in apps} == {"Twitch": "bloat", "Settings": "protected"}


def test_app_versions_are_optional_in_block_and_key_value_formats():
    block = _block("DclHome001.Home", "AeroTizen", "DclHome001.Home", "DclHome001")
    assert catalog.parse_applist(block)[0]["version"] is None
    block += "--------------app_version                         =2.2.0-------------\n"
    assert catalog.parse_applist(block)[0]["version"] == "2.2.0"
    line = "app_id=DclHome001.Home app_version=2.2.0"
    assert catalog.parse_applist(line)[0]["version"] == "2.2.0"
    assert catalog.parse_applist("DclHome001.Home")[0]["version"] is None
