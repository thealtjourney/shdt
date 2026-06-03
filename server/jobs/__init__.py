"""Scheduled job runner utilities.

Used by every enrich_*.py script to:
  - Record run start / finish in the enrichment_runs table
  - Acquire a Postgres advisory lock so two instances can never collide
  - Configure structured JSON logging into App Insights
  - Handle SIGTERM cleanly so Container Apps Jobs can drain
  - Emit a single audit-trail row per execution

Usage:

    from jobs.runner import run_job

    @run_job("crime")
    def main():
        # …enrichment work…
        return {"records_updated": 1234}

    if __name__ == "__main__":
        main()
"""
from .runner import run_job, JobContext, JOB_SOURCES

__all__ = ["run_job", "JobContext", "JOB_SOURCES"]
