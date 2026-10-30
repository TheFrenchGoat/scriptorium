# Scriptorium - publication d'une version en brouillon sur GitHub
# Lancement, depuis le dossier du projet :
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\publier.ps1
# Le jeton GH_TOKEN est demande en saisie masquee s'il est absent.
# Il n'est jamais ecrit sur le disque.
# La version est lue dans package.json ; elle doit etre identique dans
# package-lock.json (lignes 3 et 9) et dans le premier bloc de
# src/renderer/lib/whats-new.ts.

$ErrorActionPreference = 'Stop'
$script:rapport = New-Object System.Collections.Generic.List[string]
$script:codeRetour = 0
$script:jetonPose = $false
$script:dossierDepart = (Get-Location).Path
$script:cwdDepart = [System.Environment]::CurrentDirectory
$script:ancienPrompt = $env:GIT_TERMINAL_PROMPT

function Rap([string]$texte) {
    $script:rapport.Add($texte)
    Write-Host $texte
}

function Run-Cmd([string]$cmdline) {
    $ancien = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $sortie = cmd.exe /c "$cmdline 2>&1"
        $script:codeRetour = $LASTEXITCODE
    } finally { $ErrorActionPreference = $ancien }
    return ,@($sortie | ForEach-Object { [string]$_ })
}

function Git-Une([string]$cmdline) {
    $sortie = Run-Cmd $cmdline
    if ($script:codeRetour -ne 0) {
        foreach ($l in $sortie) { Rap "  $l" }
        throw "Echec de la commande : $cmdline"
    }
    return ,$sortie
}

function Lire-Lignes([string]$rel) {
    $chemin = Join-Path $script:racine $rel
    if (-not (Test-Path -LiteralPath $chemin)) { throw "Fichier introuvable : $rel" }
    return ,[System.IO.File]::ReadAllLines($chemin, [System.Text.Encoding]::UTF8)
}

try {
    $script:racine = Split-Path -Parent $PSScriptRoot
    Set-Location -LiteralPath $script:racine
    [System.Environment]::CurrentDirectory = $script:racine
    $env:GIT_TERMINAL_PROMPT = '0'
    Rap 'PUBLICATION SCRIPTORIUM (brouillon GitHub)'
    Rap "Dossier : $script:racine"

    # --- 1. Version ---
    $motifJson = '^\s*"version":\s*"(\d+\.\d+\.\d+)",\s*$'
    $pj = Lire-Lignes 'package.json'
    $m = [regex]::Match($pj[2], $motifJson)
    if (-not $m.Success) { throw 'package.json : version introuvable en ligne 3' }
    $version = $m.Groups[1].Value
    $lk = Lire-Lignes 'package-lock.json'
    foreach ($num in @(3, 9)) {
        $m2 = [regex]::Match($lk[$num - 1], $motifJson)
        if (-not $m2.Success -or $m2.Groups[1].Value -ne $version) { throw "package-lock.json ligne $num : version differente de $version" }
    }
    $wn = Lire-Lignes 'src/renderer/lib/whats-new.ts'
    $premiere = $null
    foreach ($l in $wn) {
        $m3 = [regex]::Match($l, '^\s*version:\s*''([^'']+)'',')
        if ($m3.Success) { $premiere = $m3.Groups[1].Value; break }
    }
    if ($premiere -ne $version) { throw "whats-new.ts : le premier bloc est $premiere au lieu de $version" }
    $tag = "v$version"
    Rap "Version : $version (package.json, package-lock.json et whats-new.ts concordent)"

    # --- 2. Etat de Git ---
    $branche = (Git-Une 'git rev-parse --abbrev-ref HEAD')[0]
    if ($branche -ne 'main') { throw "Branche $branche : il faut etre sur main" }
    $etat = Git-Une 'git status --porcelain'
    if ($etat.Count -gt 0) {
        foreach ($l in $etat) { Rap "  $l" }
        throw 'Le depot contient des modifications non enregistrees'
    }
    Rap 'Lecture de l etat de GitHub...'
    [void](Git-Une 'git fetch -q origin')
    $retard = [int]((Git-Une 'git rev-list --count HEAD..origin/main')[0])
    if ($retard -ne 0) { throw "Le depot local a $retard commit(s) de retard sur GitHub" }
    $avance = [int]((Git-Une 'git rev-list --count origin/main..HEAD')[0])
    foreach ($t2 in (Git-Une 'git tag -l')) {
        if ($t2.Trim() -ieq $tag) { throw "Le tag $tag existe deja sur ce PC" }
    }
    foreach ($t2 in (Git-Une 'git ls-remote --tags origin')) {
        $nomTag = (($t2 -split '\s+')[-1]) -replace '\^\{\}$', ''
        if ($nomTag -ieq "refs/tags/$tag") { throw "Le tag $tag existe deja sur GitHub" }
    }
    Rap "Branche main, depot propre, aucun retard, tag $tag libre. Commits a envoyer : $avance"

    # --- 3. Confirmation ---
    Rap ''
    $reponse = Read-Host "Envoyer sur GitHub et creer le brouillon $tag ? Taper OUI pour continuer"
    if ($reponse -cne 'OUI') { Rap 'Annule : rien n a ete envoye.'; return }

    # --- 4. Envoi des commits ---
    $env:GIT_TERMINAL_PROMPT = $script:ancienPrompt
    if ($avance -gt 0) {
        Rap 'Envoi des commits (git push origin main)...'
        foreach ($l in (Git-Une 'git push origin main')) { Rap "  $l" }
    }
    $commitLocal = (Git-Une 'git rev-parse HEAD')[0].Trim()
    $commitDistant = (Git-Une 'git ls-remote origin refs/heads/main')[0]
    if (-not $commitDistant.StartsWith($commitLocal)) { throw 'Apres envoi, GitHub ne pointe pas sur le meme commit que ce PC' }
    Rap ("GitHub est a jour : " + $commitLocal.Substring(0, 7))

    # --- 5. Jeton ---
    if ([string]::IsNullOrWhiteSpace($env:GH_TOKEN)) {
        $secret = Read-Host 'Jeton GitHub (saisie masquee)' -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        try { $clair = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
        if ([string]::IsNullOrWhiteSpace($clair)) { throw 'Jeton vide : brouillon non cree (les commits deja envoyes ne posent aucun probleme)' }
        $env:GH_TOKEN = $clair.Trim()
        $clair = $null
        $script:jetonPose = $true
        Rap 'Jeton recu (ni affiche, ni enregistre).'
    } else { Rap 'Jeton deja present dans la session.' }

    # --- 6. Construction et envoi du brouillon ---
    $debut = (Get-Date).AddSeconds(-5)
    $journal = Join-Path $env:TEMP "scriptorium-build-$version.log"
    Rap 'npm run release : construction puis envoi du brouillon (plusieurs minutes)...'
    $ancien = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        cmd.exe /c "npm run release 2>&1" | Tee-Object -FilePath $journal | Out-Host
        $script:codeRetour = $LASTEXITCODE
    } finally { $ErrorActionPreference = $ancien }
    $dossierRelease = Join-Path $script:racine 'release'
    if ((Test-Path -LiteralPath $journal) -and (Test-Path -LiteralPath $dossierRelease)) {
        Copy-Item -LiteralPath $journal -Destination (Join-Path $dossierRelease "build-$version.log") -Force
    }
    if ($script:codeRetour -ne 0) {
        Rap "npm run release a echoue (code $script:codeRetour). 40 dernieres lignes :"
        if (Test-Path -LiteralPath $journal) {
            foreach ($l in @(Get-Content -LiteralPath $journal -Tail 40)) { Rap "  $l" }
        }
        throw 'Echec de npm run release : regarder sur GitHub si un brouillon incomplet existe, et le supprimer'
    }

    # --- 7. Verification des fichiers produits ---
    $nomExe = "Scriptorium Setup $version.exe"
    $nomUrl = "Scriptorium-Setup-$version.exe"
    $cheminExe = Join-Path $dossierRelease $nomExe
    $cheminMap = "$cheminExe.blockmap"
    $cheminYml = Join-Path $dossierRelease 'latest.yml'
    foreach ($f in @($cheminExe, $cheminMap, $cheminYml)) {
        if (-not (Test-Path -LiteralPath $f)) { throw "Fichier absent : $f" }
        if ((Get-Item -LiteralPath $f).LastWriteTime -lt $debut) { throw "Fichier ancien (non regenere) : $f" }
    }
    $ymlVersion = $null; $ymlPath = $null; $ymlSha = $null; $ymlTaille = $null
    foreach ($l in [System.IO.File]::ReadAllLines($cheminYml, [System.Text.Encoding]::UTF8)) {
        if ($l -match '^version:\s*(\S+)\s*$') { $ymlVersion = $Matches[1] }
        elseif ($l -match '^path:\s*(\S+)\s*$') { $ymlPath = $Matches[1] }
        elseif ($l -match '^sha512:\s*(\S+)\s*$') { $ymlSha = $Matches[1] }
        elseif ($l -match '^\s+size:\s*(\d+)\s*$') { $ymlTaille = [int64]$Matches[1] }
    }
    if ($ymlVersion -ne $version) { throw "latest.yml : version $ymlVersion au lieu de $version" }
    if ($ymlPath -ne $nomUrl) { throw "latest.yml : fichier $ymlPath au lieu de $nomUrl" }
    $tailleExe = (Get-Item -LiteralPath $cheminExe).Length
    if ($ymlTaille -ne $tailleExe) { throw "latest.yml : taille $ymlTaille au lieu de $tailleExe" }
    $sha = [System.Security.Cryptography.SHA512]::Create()
    $flux = [System.IO.File]::OpenRead($cheminExe)
    try { $empreinte = [Convert]::ToBase64String($sha.ComputeHash($flux)) }
    finally { $flux.Dispose(); $sha.Dispose() }
    if ($ymlSha -ne $empreinte) { throw 'latest.yml : empreinte sha512 differente de celle de l installateur' }
    Rap "Verifie : $nomExe ($tailleExe octets), blockmap, latest.yml (version, taille et sha512 corrects)"

    Rap ''
    Rap "BROUILLON $tag CREE SUR GITHUB"
    Rap 'A faire maintenant :'
    Rap '  1. Ouvrir https://github.com/TheFrenchGoat/scriptorium/releases'
    Rap "  2. Ouvrir le brouillon $tag et verifier les 3 fichiers (installateur, blockmap, latest.yml)"
    Rap '  3. Cliquer sur Publish release'
    Rap '  4. Puis, dans PowerShell : git fetch --tags  (pour recuperer le tag sur ce PC)'
}
catch {
    $script:rapport.Add(("ERREUR : {0} (ligne {1})" -f $_.Exception.Message, $_.InvocationInfo.ScriptLineNumber))
    Write-Host $script:rapport[$script:rapport.Count - 1] -ForegroundColor Red
}
finally {
    if ($script:jetonPose) { Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue }
    $env:GIT_TERMINAL_PROMPT = $script:ancienPrompt
    Set-Location -LiteralPath $script:dossierDepart
    [System.Environment]::CurrentDirectory = $script:cwdDepart
    if ($script:rapport.Count -eq 0) { $script:rapport.Add('RAPPORT VIDE (anomalie)') }
    Set-Clipboard -Value ($script:rapport -join "`r`n")
    Write-Host ''
    Write-Host '(Rapport copie dans le presse-papiers)'
}
