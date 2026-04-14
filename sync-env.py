import os
import subprocess
from pathlib import Path

def sync_vercel_env():
    """Reads the root .env.local and syncs each variable to the Vercel Production vault."""
    env_path = Path('.env.local')
    
    if not env_path.exists():
        print("?? No .env.local file found in the root. Skipping sync.")
        return

    print("Vercel Watcher: Syncing local .env.local to Production Vault...")
    
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
                
                # Strip surrounding quotes if they exist
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                
                if key and val:
                    # Sync logic using PowerShell for robust escaping on Windows
                    # We pass the value via an environment variable to ensure zero shell interpolation
                    target_env = os.environ.copy()
                    target_env["KV_VAL"] = val

                    # 1. Try to remove existing var (ignore failure if it doesn't exist)
                    subprocess.run(
                        ["powershell.exe", "-ExecutionPolicy", "Bypass", "-Command", f"npx vercel env rm {key} production --yes"],
                        env=target_env,
                        capture_output=True
                    )
                    
                    # 2. Add/Update the variable using the env var for the value
                    result = subprocess.run(
                        ["powershell.exe", "-ExecutionPolicy", "Bypass", "-Command", f"npx vercel env add {key} production --value $env:KV_VAL --yes"],
                        env=target_env,
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
