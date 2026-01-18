FROM ubuntu:22.04

# Non-interactive for automated builds
ENV DEBIAN_FRONTEND=noninteractive

# Update and install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    git \
    xvfb \
    x11vnc \
    fluxbox \
    novnc \
    websockify \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Install yt-dlp
RUN pip3 install yt-dlp

# Set up work directory
WORKDIR /app

# Copy project files
COPY package.json .
RUN npm install

COPY . .

# Environment variables for VNC and App
ENV DISPLAY=:0
ENV RESOLUTION=1024x768x24
ENV VNC_PORT=5900
ENV NOVNC_PORT=8080

# Expose ports
EXPOSE 8080
EXPOSE 5900

# Copy and prepare entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
