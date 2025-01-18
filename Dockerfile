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
ENV OPENAI_ORGANIZATION ""
ENV OPENAI_PROJECT ""
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
ENV WHISPER_API_KEY ""
ENV WHISPER_API_URL "https://transcribe.whisperapi.com"
ENV TRANSCRIPTION_ENABLED true
ENV TRANSCRIPTION_MODE "openai"
ENV TRANSCRIPTION_LANGUAGE ""
ENV TTS_ENABLED false
ENV TTS_TRANSCRIPTION_RESPONSE_ENABLED true
ENV TTS_MODE "speech-api"
ENV AWS_ACCESS_KEY_ID ""
ENV AWS_SECRET_ACCESS_KEY ""
ENV AWS_REGION "eu-central-1"
ENV AWS_POLLY_VOICE_ID "Joanna"
ENV AWS_POLLY_VOICE_ENGINE "standard"
ENV SERPAPI_API_KEY ""
ENV NODE_ENV production
ENV CHROME_BIN /usr/bin/chromium

# Set permissions
RUN chown -R appuser:appuser /app && \
    chmod -R 755 /app

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "run", "start"]
