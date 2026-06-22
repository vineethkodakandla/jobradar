"""Job sources: aggregator APIs + public ATS boards.

Each source module exposes a class implementing the ``Source`` protocol from
``base.py`` — a ``fetch()`` that returns ``list[RawJob]`` and never raises
(network/parse errors are swallowed and logged so one bad source can't fail the
whole run).
"""
