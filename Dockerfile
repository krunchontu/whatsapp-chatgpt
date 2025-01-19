# Build stage
FROM node:18-bullseye-slim AS build

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies with cleanup
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    chromium-common \
    chromium-sandbox \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    npm install --production

# Runtime stage
FROM node:18-bullseye-slim

# Install required libraries and 'tini'
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libdbus-1-3 \
        libx11-6 \
        libx11-xcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxi6 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libasound2 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libgtk-3-0 \
        libxrender1 \
        libfontconfig1 \
        libfreetype6 \
        libglib2.0-0 \
        gconf-service \
        libcups2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf2.0-0 \
        libnspr4 \
        tini \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && \
    useradd -r -g appuser -d /app -s /bin/bash appuser

# Copy dependencies from build stage
COPY --from=build /usr/bin/chromium /usr/bin/chromium
COPY --from=build /usr/lib/chromium /usr/lib/chromium
COPY --from=build /usr/lib/x86_64-linux-gnu/ /usr/lib/x86_64-linux-gnu/
COPY --from=build /usr/share/fonts /usr/share/fonts
COPY --from=build /usr/bin/ffmpeg /usr/bin/ffmpeg
COPY --from=build /etc/chromium /etc/chromium
COPY --from=build /etc/chromium.d/ /etc/chromium.d/

WORKDIR /app

# Copy application files
COPY --from=build /app/node_modules ./node_modules
COPY --chown=appuser:appuser . .


# Environment variables
ENV OPENAI_TIMEOUT 30000
ENV OPENAI_MAX_RETRIES 5
ENV OPENAI_GPT_MODEL "gpt-4o"
ENV MAX_MODEL_TOKENS 2000
ENV PREFIX_ENABLED ""
ENV PREFIX_SKIPPED_FOR_ME true
ENV GPT_PREFIX "!gpt"
ENV DALLE_PREFIX "!dalle"
ENV RESET_PREFIX "!reset"
ENV AI_CONFIG_PREFIX "!config"
ENV GROUPCHATS_ENABLED true
ENV MODERATION_ENABLED true
ENV CUSTOM_MODERATION_PARAMS '{"political_content":true,"misinformation":true,"hate_speech":true,"explicit_content":true}'
ENV WHITELISTED_PHONE_NUMBERS ""
ENV WHITELISTED_ENABLED false
ENV HUGGINGFACE_API_TOKEN ""
ENV WHISPER_API_URL "https://transcribe.whisperapi.com"
ENV TRANSCRIPTION_ENABLED true
ENV TRANSCRIPTION_MODE "openai"
ENV TRANSCRIPTION_LANGUAGE ""
ENV TTS_ENABLED false
ENV TTS_TRANSCRIPTION_RESPONSE_ENABLED true
ENV TTS_MODE "speech-api"
ENV AWS_REGION "eu-central-1"
ENV AWS_POLLY_VOICE_ID "Joanna"
ENV AWS_POLLY_VOICE_ENGINE "standard"
ENV NODE_ENV production
ENV CHROME_BIN /usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium
ENV CHROME_PATH /usr/bin/chromium

# Set permissions
RUN chown -R appuser:appuser /app && \
    chmod -R 755 /app

USER appuser

# Set 'tini' as the entrypoint
ENTRYPOINT ["/usr/bin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "run", "start"]
