"""Keep repository-root pip installs using the package definition in cli/."""

import os
from pathlib import Path

from setuptools import build_meta


def _absolute(directory):
    return str(Path(directory).resolve()) if directory is not None else None


def _call(hook, *args):
    previous = Path.cwd()
    try:
        os.chdir(Path(__file__).resolve().parent)
        return getattr(build_meta, hook)(*args)
    finally:
        os.chdir(previous)


def get_requires_for_build_wheel(config_settings=None):
    return _call("get_requires_for_build_wheel", config_settings)


def get_requires_for_build_sdist(config_settings=None):
    return _call("get_requires_for_build_sdist", config_settings)


def get_requires_for_build_editable(config_settings=None):
    return _call("get_requires_for_build_editable", config_settings)


def prepare_metadata_for_build_wheel(metadata_directory, config_settings=None):
    return _call("prepare_metadata_for_build_wheel", _absolute(metadata_directory), config_settings)


def prepare_metadata_for_build_editable(metadata_directory, config_settings=None):
    return _call("prepare_metadata_for_build_editable", _absolute(metadata_directory), config_settings)


def build_wheel(wheel_directory, config_settings=None, metadata_directory=None):
    return _call("build_wheel", _absolute(wheel_directory), config_settings, _absolute(metadata_directory))


def build_editable(wheel_directory, config_settings=None, metadata_directory=None):
    return _call("build_editable", _absolute(wheel_directory), config_settings, _absolute(metadata_directory))


def build_sdist(sdist_directory, config_settings=None):
    return _call("build_sdist", _absolute(sdist_directory), config_settings)
