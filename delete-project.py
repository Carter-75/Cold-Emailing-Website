import os
import sys
import subprocess
import time
import shutil

def main():
    project_name = "Cold-Emailing-Website"
    project_path = os.path.dirname(os.path.abspath(__file__))

    print(f"\n--- EMERGENCY DELETION: {project_name} ---")
    print(f"Target Path: {project_path}\n")

    # Check if we are inside the directory
    if os.getcwd() == project_path:
        print("WARNING: You are currently INSIDE the project directory in your terminal.")
        print("I will change the current directory to '..' to allow full deletion.\n")
        os.chdir('..')

    # 3 Warnings
    input(f"WARNING 1/3: This will PERMANENTLY delete everything in {project_path}. Press Enter to continue...")
    input("WARNING 2/3: All code, git history, and node_modules will be GONE. Press Enter to continue...")
    input(f"WARNING 3/3: FINAL CONFIRMATION. You are about to destroy {project_name} at {project_path}. Press Enter to continue...")

    # Final verification
    confirm = input(f"\nTo confirm, type the exact project name '{project_name}': ").strip()

    if confirm == project_name:
        print("\nOK. Initiating force-deletion...")
        
        # 1. Try to delete contents first
        for item in os.listdir(project_path):
            if item == 'delete-project.py': continue
            item_path = os.path.join(project_path, item)
            try:
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path, ignore_errors=True)
                else:
                    os.remove(item_path)
                print(f"   Deleted: {item}")
            except Exception as e:
                print(f"   [!] Could not delete {item}: {e}")

        # 2. Spawn a background process to kill this script and try to remove the root and itself
        print("\nAttempting to remove root directory in 1 second...")
        # We use a more aggressive PowerShell command that retries and ignores errors
        cmd = f"Start-Sleep -s 1; 1..5 | % {{ Remove-Item -Path '{project_path}' -Recurse -Force -ErrorAction SilentlyContinue; if (!(Test-Path '{project_path}')) {{ break }}; Start-Sleep -s 1 }}"
        subprocess.Popen(["powershell", "-Command", cmd], shell=True)
        sys.exit(0)
    else:
        print("\nName mismatch. Deletion cancelled.")

if __name__ == '__main__':
    main()
