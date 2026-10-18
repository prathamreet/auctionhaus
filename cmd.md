
```cpp
clear; npm run build:front; npm run build:back; npm run test; npm run lint:front; npm run lint:back;
```


```bash
# PostgreSQL (matching DATABASE_URL in back/.env)
docker run --name auctionhaus-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=auctionhaus -p 5432:5432 -d postgres:16-alpine

# Redis
docker run --name auctionhaus-redis -p 6379:6379 -d redis:7-alpine
```

```bash
# Or start both via Docker Compose
docker compose up -d
```


```cpp
npm run sim:run
npm run train:fraud
npm run eval:fraud
```


```cpp
npm run db:prepare-bench
```


```bash
# Compile Paper ID 1255: Atomic Ladder & Cover Letter
cd paper; pdflatex auto-bid-ladder; bibtex auto-bid-ladder; pdflatex auto-bid-ladder; pdflatex auto-bid-ladder; pdflatex cover-letter; cd ..

# Compile Shill Bidding Paper
cd paper; pdflatex main; bibtex main; pdflatex main; pdflatex main; cd ..
```
