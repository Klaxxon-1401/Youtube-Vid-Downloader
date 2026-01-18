import sys
import json
import yt_dlp
import os

# Function to send status updates to Electron
def send_status(status_type, data):
    print(json.dumps({"type": status_type, "data": data}), flush=True)

class ElectronLogger:
    def debug(self, msg):
        pass
    def warning(self, msg):
        pass
    def error(self, msg):
        send_status("error", str(msg))

def progress_hook(d):
    if d['status'] == 'downloading':
        try:
            percent = 0
            if 'total_bytes' in d:
                percent = (d['downloaded_bytes'] / d['total_bytes']) * 100
            elif 'total_bytes_estimate' in d:
                percent = (d['downloaded_bytes'] / d['total_bytes_estimate']) * 100
            
            speed = d.get('speed', 0)
            eta = d.get('eta', 0)
            
            send_status("progress", {
                "percent": percent,
                "speed": speed,
                "eta": eta
            })
        except:
            pass
    elif d['status'] == 'finished':
        send_status("status", "Processing...")

def download_video(url, path):
    try:
        if not os.path.exists(path):
            os.makedirs(path, exist_ok=True)
            
        ydl_opts = {
            'format': 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'outtmpl': f'{path}/%(title)s.%(ext)s',
            'merge_output_format': 'mp4',
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitleslangs': ['en'],
            'embedsubs': True,
            'postprocessor_args': {
                'merger': ['-c:v', 'copy', '-c:a', 'copy']
            },
            'progress_hooks': [progress_hook],
            'logger': ElectronLogger(),
            'quiet': True,
            'no_warnings': True
        }
        
        send_status("status", "Starting download...")
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get('title', 'Unknown')
            send_status("complete", title)
            
    except Exception as e:
        send_status("error", str(e))

if __name__ == "__main__":
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        if not input_data:
            pass # Wait for data? No, child_process.spawn sends data
            
        data = json.loads(input_data)
        url = data.get("url")
        path = data.get("path")
        
        if url and path:
            download_video(url, path)
        else:
            send_status("error", "Missing URL or Path")
            
    except Exception as e:
        # If running without input (dev check), just exit or print error
        # send_status("error", f"Script error: {str(e)}")
        pass
