import zipfile
import os
import shutil

def extract_ffmpeg():
    zip_path = "ffmpeg.zip"
    bin_dir = os.path.join("bin", "win32")
    
    if not os.path.exists(bin_dir):
        os.makedirs(bin_dir)
        
    if not os.path.exists(zip_path):
        print("ffmpeg.zip not found.")
        return

    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for file in zip_ref.namelist():
                if file.endswith("bin/ffmpeg.exe"):
                    print(f"Extracting {file}...")
                    source = zip_ref.open(file)
                    target_path = os.path.join(bin_dir, "ffmpeg.exe")
                    with open(target_path, "wb") as target:
                        shutil.copyfileobj(source, target)
                    print(f"Extracted to {target_path}")
                    return
        print("ffmpeg.exe not found in zip.")
    except zipfile.BadZipFile:
        print("Invalid zip file.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    extract_ffmpeg()
