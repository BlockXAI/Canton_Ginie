FROM eclipse-temurin:17-jre-jammy

WORKDIR /canton

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    netcat-openbsd \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Download and extract Canton with retry logic
ARG CANTON_VERSION=2.9.3
RUN set -e && \
    MAX_RETRIES=3 && \
    RETRY_COUNT=0 && \
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do \
        echo "Download attempt $((RETRY_COUNT + 1)) of $MAX_RETRIES..." && \
        curl -L --retry 5 --retry-delay 3 --retry-max-time 300 \
            --connect-timeout 30 --max-time 600 \
            "https://github.com/digital-asset/canton/releases/download/v${CANTON_VERSION}/canton-open-source-${CANTON_VERSION}.tar.gz" \
            -o canton.tar.gz && break || \
        { \
            RETRY_COUNT=$((RETRY_COUNT + 1)); \
            echo "Download failed, retrying in 5 seconds..."; \
            sleep 5; \
            rm -f canton.tar.gz; \
        }; \
    done && \
    if [ ! -f canton.tar.gz ]; then \
        echo "Failed to download Canton after $MAX_RETRIES attempts" && exit 1; \
    fi && \
    echo "Extracting Canton..." && \
    tar -xzf canton.tar.gz && \
    mv canton-open-source-${CANTON_VERSION}/* . && \
    rm -rf canton-open-source-${CANTON_VERSION} canton.tar.gz && \
    chmod +x /canton/bin/canton && \
    echo "Canton installation complete"

# Download the HTTP JSON API standalone JAR
ARG DAML_SDK_VERSION=2.10.4
RUN curl -L --retry 3 --retry-delay 5 \
    "https://github.com/digital-asset/daml/releases/download/v${DAML_SDK_VERSION}/http-json-${DAML_SDK_VERSION}.jar" \
    -o /canton/http-json.jar && \
    echo "JSON API JAR downloaded"

# Create config directory
RUN mkdir -p /canton/config

# Copy configuration files
COPY canton-railway.conf /canton/config/canton-railway.conf
COPY json-api.conf /canton/config/json-api.conf
COPY bootstrap.canton /canton/config/bootstrap.canton
COPY entrypoint.sh /canton/entrypoint.sh
RUN chmod +x /canton/entrypoint.sh

# Expose ports
# 6865 - Ledger API (gRPC)
# 7575 - HTTP JSON API (REST bridge)
# 7576 - Admin API
EXPOSE 6865 7575 7576

ENTRYPOINT ["/canton/entrypoint.sh"]
