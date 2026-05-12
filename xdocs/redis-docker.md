# Local Redis Setup for Development

To avoid Upstash rate limits and billing during local development, it is highly recommended to run a local Redis instance using Docker.

## Option 1: Quick Start (Single Command)

If you have Docker Desktop or Docker Engine installed, simply run this command in your terminal to start a Redis server in the background:

```bash
docker run --name auctionhaus-redis -p 6379:6379 -d redis:alpine
```

This will:
- Download the lightweight `redis:alpine` image.
- Start the container in the background (`-d`).
- Map your machine's port 6379 to the container's port 6379.
- Name the container `auctionhaus-redis`.

### Stopping and Starting later

- **To stop it**: `docker stop auctionhaus-redis`
- **To start it again**: `docker start auctionhaus-redis`
- **To completely remove it**: `docker rm -f auctionhaus-redis`

---

## Option 2: Docker Compose Setup

If you prefer using `docker-compose` to manage services, create a file named `docker-compose.yml` in the root of your project:

```yaml
version: '3.8'
services:
  redis:
    image: redis:alpine
    container_name: auctionhaus-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  redis_data:
```

Then run:
```bash
docker compose up -d
```
*(This version persists your queue and session data across restarts using volumes!)*

---

## Environment Variable Setup

Once your local Redis is running, update your `back/.env` file to point to localhost instead of the Upstash production database:

```env
# Comment out production Upstash Redis
# REDIS_URL="rediss://default:ASJOAAIm...upstash.io:6379"

# Use local Docker Redis
REDIS_URL="redis://localhost:6379"
```

Then restart your backend development server (`npm run dev`).
