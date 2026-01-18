import yt_dlp
import os

path = "/home/devan/Devan/Downloaded YT vids"
link = input("Enter the link: ")

ydl_opts = {
    'format': 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4]/best --write-auto-subs',
    'outtmpl': f'{path}/%(title)s.%(ext)s',
    'merge_output_format': 'mp4',

    'writesubtitles': True,            
    'writeautomaticsub': True,         
    'subtitleslangs': ['en'],          
    'embedsubs': True,
    'postprocessor_args': {
        'merger': ['-c:v', 'copy', '-c:a', 'copy']
    },
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download([link])

print("\nHigh-quality download complete!")