FROM node:22-slim

# Install Python 3 + required system deps for yt-dlp and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Build the app
COPY . .
RUN npm run build

EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
