"""Validate the TV helper inventory shipped in a desktop worker, without contacting a TV."""

import hashlib

from aerotizen import home, home_control, root_package


def inventory():
    query = home.load_helper()
    control = home_control.load_helper()
    runtime, manifest, icon = root_package.runtime_files()
    groups = {"home_query": query, "home_control": control, "root_runtime": runtime}
    result = {
        group: {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
        for group, files in groups.items()
    }
    result["root_metadata"] = {
        "manifest": hashlib.sha256(manifest).hexdigest(),
        "icon": hashlib.sha256(icon).hexdigest(),
    }
    return result
