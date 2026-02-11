import os
import urllib.request
import zipfile
import shutil
import time

def download_and_extract():
    url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    zip_path = "ffmpeg.zip"
    bin_dir = os.path.join("bin", "win32")

    if not os.path.exists(bin_dir):
        os.makedirs(bin_dir)

    print(f"Downloading {url}...")
    try:
        urllib.request.urlretrieve(url, zip_path)
        print("Download complete.")
        
        print("Extracting...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for file in zip_ref.namelist():
                if file.endswith("bin/ffmpeg.exe"):
                    print(f"found {file}, extracting...")
                    source = zip_ref.open(file)
                    target = open(os.path.join(bin_dir, "ffmpeg.exe"), "wb")
                    with source, target:
                        shutil.copyfileobj(source, target)
                    break
        print("Done.")
    except Exception as e:
        print(f"Failed: {e}")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)

if __name__ == "__main__":
    download_and_extract()
