"""
================================================================
ScrapeForge — Python Worker Entry Point
================================================================
Routes to the correct worker based on WORKER_TYPE env var.
"""
import os
import sys

def main():
    worker_type = os.environ.get('WORKER_TYPE', 'http')
    
    print(f"[ScrapeForge] Starting Python worker: {worker_type}")
    
    if worker_type == 'http':
        from http_worker import HTTPWorker
        worker = HTTPWorker()
    elif worker_type == 'browser':
        from browser_worker import BrowserWorker
        worker = BrowserWorker()
    elif worker_type == 'crawl':
        from crawl_worker import CrawlWorker
        worker = CrawlWorker()
    elif worker_type == 'serp':
        from serp_worker import SERPWorker
        worker = SERPWorker()
    elif worker_type == 'nlp':
        from nlp_worker import NLPWorker
        worker = NLPWorker()
    else:
        print(f"[ERROR] Unknown worker type: {worker_type}")
        sys.exit(1)
    
    worker.start()

if __name__ == '__main__':
    main()
