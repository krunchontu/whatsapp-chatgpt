# Build stage
FROM node:18-bullseye-slim AS build

# Install dependencies with cleanup
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gconf-service libgbm-dev libasound2 libatk1.0-0 libc6 libcairo2 \
    libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
    libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
    libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation \
    libappindicator1 libnss3 lsb-release xdg-utils wget chromium ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Runtime stage
FROM node:18-bullseye-slim

# Create non-root user
RUN groupadd -r appuser && \
    useradd -r -g appuser -d /app -s /bin/bash appuser

# Copy dependencies from build stage
COPY --from=build /usr/bin/chromium /usr/bin/chromium
COPY --from=build /usr/lib/chromium /usr/lib/chromium
COPY --from=build /usr/lib/x86_64-linux-gnu/ /usr/lib/x86_64-linux-gnu/
COPY --from=build /usr/share/fonts /usr/share/fonts
COPY --from=build /usr/bin/ffmpeg /usr/bin/ffmpeg

WORKDIR /app

# Copy application files
COPY --from=build /app/node_modules ./node_modules
COPY --chown=appuser:appuser . .

# Environment variables
ENV OPENAI_API_KEY ""
ENV PREFIX_ENABLED ""
ENV NODE_ENV production
ENV CHROME_BIN /usr/bin/chromium

# Set permissions
RUN chown -R appuser:appuser /app && \
    chmod -R 755 /app

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "run", "start"]
