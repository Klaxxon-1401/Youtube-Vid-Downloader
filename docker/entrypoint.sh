#!/bin/bash

# Start Xvfb (Virtual Framebuffer)
echo "Starting Xvfb..."
Xvfb :0 -screen 0 $RESOLUTION &
sleep 2

# Start Fluxbox (Window Manager)
echo "Starting Fluxbox..."
fluxbox &
sleep 1

# Start x11vnc
echo "Starting x11vnc..."
x11vnc -display :0 -forever -nopw -listen localhost -xkb &
sleep 1

# Start noVNC (websockify)
echo "Starting noVNC on port $NOVNC_PORT..."
/usr/share/novnc/utils/novnc_proxy --vnc localhost:$VNC_PORT --listen $NOVNC_PORT &
sleep 1

# Start the application
echo "Starting YouTube Downloader..."
# We use --no-sandbox because Docker runs as root by default
npm start -- --no-sandbox
