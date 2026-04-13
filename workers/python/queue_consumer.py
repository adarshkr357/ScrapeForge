"""
================================================================
Queue Consumer — Native BullMQ v5 worker for Python
================================================================
Seamlessly connects to Redis Streams.
"""
import os
import json
import time
import uuid
import asyncio
import traceback
import redis
from bullmq import Worker

REDIS_HOST = os.environ.get('REDIS_HOST', '127.0.0.1')
REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))
REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD', None)

class QueueConsumer:
    """
    Native BullMQ consumer for Python workers (v5 compatible).
    Utilizes Redis Streams for strict queue extraction.
    """
    
    def __init__(self, queue_name, concurrency=10, worker_id=None):
        self.queue_name = queue_name
        self.concurrency = concurrency
        self.worker_id = worker_id or f"py-{queue_name}-{uuid.uuid4().hex[:8]}"
        self.redis_sync = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD,
            decode_responses=True,
        )
    
    def start(self, processor):
        """Start consuming jobs from the queue utilizing asyncio loop."""
        print(f"[QueueConsumer] {self.worker_id} listening on queue stream: {self.queue_name}")
        
        async def process(job, job_token):
            loop = asyncio.get_event_loop()
            try:
                # Execute the synchronous scraper inside a thread pool executor
                result = await loop.run_in_executor(None, processor, job.data)
                
                # Failsafe Redis Cache Storage for API polling bridging
                if isinstance(result, dict) and result.get('requestId'):
                    self.redis_sync.setex(
                        f"result:{result['requestId']}",
                        3600,
                        json.dumps(result)
                    )
                return result
            except Exception as e:
                # Logging raw exceptions
                print(f"[QueueConsumer] Exception in processing {job.id}: {str(e)}")
                raise e

        async def main():
            # Establish the BullMQ v5 Worker
            connection = {
                "host": REDIS_HOST,
                "port": REDIS_PORT,
            }
            if REDIS_PASSWORD:
                connection["password"] = REDIS_PASSWORD
                
            worker = Worker(
                self.queue_name, 
                process, 
                {"connection": connection, "concurrency": self.concurrency}
            )
            
            # Heartbeats
            while True:
                self.redis_sync.setex(
                    f"worker:heartbeat:{self.worker_id}",
                    15,
                    json.dumps({
                        'workerId': self.worker_id,
                        'queue': self.queue_name,
                        'concurrency': self.concurrency,
                        'timestamp': int(time.time() * 1000),
                    })
                )
                await asyncio.sleep(5)
                
        # Fire loop
        try:
            asyncio.run(main())
        except KeyboardInterrupt:
            print(f"[QueueConsumer] {self.worker_id} shutting down gracefully...")

    def stop(self):
        """Graceful shutdown stub."""
        pass
