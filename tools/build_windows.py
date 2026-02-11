import os
import subprocess
import sys
import shutil
import urllib.request
import zipfile

def install_requirements():
    print("Installing requirements...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])

def download_ffmpeg():
    bin_dir = os.path.join(os.getcwd(), "bin", "win32")
    if not os.path.exists(bin_dir):
        os.makedirs(bin_dir)
    
    ffmpeg_exe = os.path.join(bin_dir, "ffmpeg.exe")
    if os.path.exists(ffmpeg_exe):
        print("ffmpeg.exe already exists, skipping download.")
        return

    print("Downloading ffmpeg...")
    # URL for a static ffmpeg build (using gyan.dev which is a common source for windows builds)
    url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    zip_path = "ffmpeg.zip"
    
    try:
        urllib.request.urlretrieve(url, zip_path)
        print("Extracting ffmpeg...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # Check for the ffmpeg.exe inside the zip (usually in a subfolder)
            for file in zip_ref.namelist():
                if file.endswith("bin/ffmpeg.exe"):
                    source = zip_ref.open(file)
                    target = open(ffmpeg_exe, "wb")
                    with source, target:
                        shutil.copyfileobj(source, target)
                    break
        
        print("ffmpeg downloaded and extracted.")
    except Exception as e:
        print(f"Failed to download/extract ffmpeg: {e}")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)

def build_downloader():
    print("Building downloader...")
    # Assuming downloader.py is in the root
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--clean",
        "--noconsole",
        "--distpath", os.path.join("bin", "win32"),
        "--name", "downloader",
        "downloader.py"
    ]
    subprocess.check_call(cmd)
    
    # helper for cleaning up build artifacts
    if os.path.exists("build"):
        shutil.rmtree("build")
    if os.path.exists("downloader.spec"):
        os.remove("downloader.spec")

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root_dir)
    
    try:
        install_requirements()
        # download_ffmpeg()
        build_downloader()
        print("Build complete!")
    except Exception as e:
        print(f"Build failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
