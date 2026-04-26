"""Smoke test: /download/{job}/source serves a zip from result_json
even when the on-disk project directory is gone.

Run with: python backend/tests/_source_zip_smoke.py
"""
import asyncio
import io
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import api.routes as r  # noqa: E402


async def collect(resp) -> bytes:
    chunks = []
    async for chunk in resp.body_iterator:
        if isinstance(chunk, str):
            chunk = chunk.encode()
        chunks.append(chunk)
    return b"".join(chunks)


def main() -> None:
    # Case 1: project_files map present -> zip from DB
    job_a = "smoke-a"
    r._in_memory_jobs[job_a] = {
        "job_id": job_a,
        "status": "complete",
        "project_files": {
            "daml/Main.daml": "module Main where\n",
            "daml.yaml": "sdk-version: 2.10.4\n",
            "src/Lib.daml": "module Lib where\n",
            ".daml/build/junk.txt": "should be skipped",
        },
    }
    resp = asyncio.run(r.download_source(job_a))
    body = asyncio.run(collect(resp))
    zf = zipfile.ZipFile(io.BytesIO(body))
    names = sorted(zf.namelist())
    expected_substrs = ["daml/Main.daml", "daml.yaml", "src/Lib.daml"]
    for sub in expected_substrs:
        assert any(sub in n for n in names), f"missing {sub} in {names}"
    assert not any(".daml/build" in n for n in names), f"build artefact leaked: {names}"
    print("Case 1 OK: project_files -> zip with", names)

    # Case 2: only generated_code present -> synthesised single-template zip
    job_b = "smoke-b"
    r._in_memory_jobs[job_b] = {
        "job_id": job_b,
        "status": "complete",
        "generated_code": "module Main where\n\ntemplate Hello\n  with\n    p : Party\n  where\n    signatory p\n",
    }
    resp = asyncio.run(r.download_source(job_b))
    body = asyncio.run(collect(resp))
    zf = zipfile.ZipFile(io.BytesIO(body))
    names = sorted(zf.namelist())
    assert any("daml/Main.daml" in n for n in names), names
    assert any("daml.yaml" in n for n in names), names
    print("Case 2 OK: generated_code -> synthesised zip with", names)

    # Case 3: nothing in result_json AND no disk dir -> 404 error
    from fastapi import HTTPException
    job_c = "smoke-c"
    r._in_memory_jobs[job_c] = {"job_id": job_c, "status": "complete"}
    raised = False
    try:
        asyncio.run(r.download_source(job_c))
    except HTTPException as e:
        raised = True
        assert e.status_code == 404, e
    assert raised, "expected 404 when nothing is available"
    print("Case 3 OK: empty result_json -> 404 as expected")

    print("source-zip smoke OK (3 cases)")


if __name__ == "__main__":
    main()
