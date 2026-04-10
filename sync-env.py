import os
import subprocess
from pathlib import Path

def sync_vercel_env():
    """Reads the root .env and syncs each variable to the Vercel Production vault."""
    env_path = Path('.env')
    
    if not env_path.exists():
        print("?? No .env file found in the root. Skipping sync.")
        return

    print("Vercel Watcher: Syncing local .env to Production Vault...")
    
    try:
        # We assume the project is linked (via 'vercel link' or similar)
        # The 'env add' command will handle link errors if they occur
        with open(env_path, "r", encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                
                if key and val:
                    result = subprocess.run(
                        ["npx", "vercel", "env", "add", key, "production", "--value", val, "--yes", "--project", project_slug],
                        shell=True,
                        capture_output=True,
                        text=True
                    )
                    if result.returncode != 0:
                        print(f"   [!] Failed to sync {key}: {result.stderr.strip()}")
                    else:
                        print(f"   Synced: {key}")

        print("Vercel Vault is now up to date.")

    except Exception as e:
        print(f"Error during Vercel sync: {e}")

if __name__ == "__main__":
    sync_vercel_env()
