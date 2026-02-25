# Fix "Electron failed to install correctly" and npm errors

## Fix 1: "Invalid Version" and EBUSY

Do these steps **in order**. **Close Cursor completely** before step 2 (so nothing locks `node_modules`).

1. **Clear npm cache** (in PowerShell):

```powershell
cd C:\Users\shubh\Desktop\interview-spy
npm cache clean --force
```

2. **Close Cursor** and any terminals using this project.

3. Open a **new** PowerShell (Run as Administrator if EBUSY persists) and run:

```powershell
cd C:\Users\shubh\Desktop\interview-spy

# Full clean
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue

# Fresh install
npm install
```

4. If you still get **EBUSY** (resource busy or locked):

- Add the project folder to **Windows Defender exclusions**: Windows Security → Virus & threat protection → Manage settings → Exclusions → Add folder → `C:\Users\shubh\Desktop\interview-spy`
- Or run `npm install` from a different drive/folder (e.g. `C:\temp\interview-spy`) then copy the project back.

5. Run the app:

```powershell
npm run dev
```

## Fix 2: Electron binary missing after install

If `npm install` succeeds but you still see "Electron failed to install correctly":

```powershell
Remove-Item -Recurse -Force node_modules\electron -ErrorAction SilentlyContinue
npm install electron@28.0.0
```

## If download fails (proxy/firewall)

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```
