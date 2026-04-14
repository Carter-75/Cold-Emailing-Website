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
        commands = []
        with open(env_path, "r", encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                
                if key and val:
                    # Escape single quotes for PowerShell
                    escaped_val = val.replace("'", "''")
                    # Remove if exists, then add. Using -ErrorAction SilentlyContinue for the rm.
                    commands.append(f"Write-Host '   Syncing {key}...'; npx vercel env rm {key} production --yes; npx vercel env add {key} production --value '{escaped_val}' --yes")

        if not commands:
            print("No variables to sync.")
            return

        # Combine into a single PS1 script content
        all_commands = "\n".join(commands)
        
        # Execute the entire batch in one PowerShell process
        result = subprocess.run(
            ["powershell.exe", "-ExecutionPolicy", "Bypass", "-Command", all_commands],
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            print(f"Error during Vercel sync:\n{result.stderr}")
        else:
            print(result.stdout)
            print("Vercel Vault is now up to date.")

    except Exception as e:
        print(f"Error during Vercel sync: {e}")


if __name__ == "__main__":
    sync_vercel_env()
