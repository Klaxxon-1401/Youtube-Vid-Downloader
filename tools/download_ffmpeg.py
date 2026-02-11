import os
import urllib.request
import zipfile
import shutil

def download_ffmpeg_github():
    """Download ffmpeg from BtbN's GitHub releases - smaller, more reliable"""
    url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
    zip_path = "ffmpeg.zip"
    bin_dir = os.path.join("bin", "win32")

    if not os.path.exists(bin_dir):
        os.makedirs(bin_dir)

    print(f"Downloading ffmpeg from GitHub releases...")
    print("This may take a few minutes...")
    
    try:
        # Download with progress
        def show_progress(block_num, block_size, total_size):
            downloaded = block_num * block_size
            percent = min(100, int(downloaded * 100 / total_size))
            print(f"\rProgress: {percent}% ({downloaded // (1024*1024)}MB / {total_size // (1024*1024)}MB)", end='')
        
        urllib.request.urlretrieve(url, zip_path, reporthook=show_progress)
        print("\nDownload complete. Extracting...")
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # Find ffmpeg.exe in the structure
            for file in zip_ref.namelist():
                if file.endswith("bin/ffmpeg.exe"):
                    print(f"Found {file}, extracting...")
                    source = zip_ref.open(file)
                    target_path = os.path.join(bin_dir, "ffmpeg.exe")
                    with open(target_path, "wb") as target:
                        shutil.copyfileobj(source, target)
                    print(f"Extracted to {target_path}")
                    break
            else:
                print("ffmpeg.exe not found in expected location, checking alternatives...")
                # Try alternative structure
                for file in zip_ref.namelist():
                    if "ffmpeg.exe" in file and "bin" in file:
                        print(f"Found {file}, extracting...")
                        source = zip_ref.open(file)
                        target_path = os.path.join(bin_dir, "ffmpeg.exe")
                        with open(target_path, "wb") as target:
                            shutil.copyfileobj(source, target)
                        print(f"Extracted to {target_path}")
                        break
        
        print("Done!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)
            print("Cleanup complete.")

if __name__ == "__main__":
    download_ffmpeg_github()
