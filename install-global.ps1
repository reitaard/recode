[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-InstallLog {
	param([string]$Message)
	Write-Host "install-global.ps1: $Message"
}

function Fail-Install {
	param([string]$Message)
	throw "install-global.ps1: $Message"
}

function Assert-ExitCode {
	param([string]$Operation)
	if ($LASTEXITCODE -ne 0) {
		Fail-Install "$Operation failed with exit code $LASTEXITCODE"
	}
}

function Invoke-NpmQuiet {
	param(
		[string]$LogPath,
		[string[]]$Arguments
	)
	& npm @Arguments *> $LogPath
	$status = $LASTEXITCODE
	if ($status -ne 0) {
		if (Test-Path -LiteralPath $LogPath) { Get-Content -LiteralPath $LogPath | Write-Error }
		Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
		Fail-Install "npm $($Arguments -join ' ') failed with exit code $status"
	}
	Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
}

function Get-RecodeProcessIds {
	$pattern = "recode-coding-agent|recode-orchestrator|recode-maestro|recode\.cmd|recode-maestro\.cmd|pi\.cmd"
	$processes = @(
		Get-CimInstance Win32_Process | Where-Object {
			($_.Name -in @("recode.exe", "recode-maestro.exe")) -or
			($_.Name -in @("node.exe", "nodejs.exe") -and $_.CommandLine -and $_.CommandLine -match $pattern)
		}
	)
	return @($processes | Select-Object -ExpandProperty ProcessId | Sort-Object -Unique)
}

function Request-RecodeProcessShutdown {
	$processIds = @(Get-RecodeProcessIds)
	if ($processIds.Count -eq 0) { return }

	$displayIds = $processIds -join " "
	Write-Host "install-global.ps1: Recode/Node processes are running (PIDs: $displayIds)"
	$answer = Read-Host "This may discard unsaved work. Force close these processes and continue? [y/N]"
	if ($answer -notmatch "^(y|yes)$") {
		Fail-Install "Installation cancelled; running Recode/Node processes were not closed."
	}

	foreach ($processId in $processIds) {
		Write-InstallLog "Force-closing PID $processId"
		& taskkill.exe /PID ([string]$processId) /T /F *> $null
		if ($LASTEXITCODE -ne 0) {
			Write-InstallLog "Windows could not submit the force-close request for PID $processId."
		}
	}

	for ($attempt = 1; $attempt -le 10; $attempt++) {
		$remaining = @(Get-RecodeProcessIds)
		if ($remaining.Count -eq 0) { return }
		Start-Sleep -Seconds 1
	}
	$remainingIds = $remaining -join " "
	Fail-Install "Some Recode/Node processes survived force termination (PIDs: $remainingIds). Close them manually before rerunning."
}

function Remove-NpmStaging {
	param(
		[string]$PackageRoot,
		[switch]$Required
	)
	if (-not (Test-Path -LiteralPath $PackageRoot -PathType Container)) { return $true }

	for ($attempt = 1; $attempt -le 5; $attempt++) {
		$staging = @(Get-ChildItem -LiteralPath $PackageRoot -Force -Directory -Filter ".recode-*" -ErrorAction SilentlyContinue)
		if ($staging.Count -eq 0) { return $true }
		foreach ($directory in $staging) {
			Remove-Item -LiteralPath $directory.FullName -Recurse -Force -ErrorAction SilentlyContinue
		}
		if ($attempt -lt 5) { Start-Sleep -Seconds 1 }
	}

	$remaining = @(Get-ChildItem -LiteralPath $PackageRoot -Force -Directory -Filter ".recode-*" -ErrorAction SilentlyContinue)
	foreach ($directory in $remaining) {
		Write-InstallLog "Could not remove temporary npm staging directory: $($directory.FullName)"
		Write-InstallLog "Close Node/Recode processes or release antivirus locks, then remove it manually."
	}
	if ($Required -and $remaining.Count -gt 0) { return $false }
	return ($remaining.Count -eq 0)
}

function Invoke-CheckedCommand {
	param(
		[string]$Executable,
		[string[]]$Arguments,
		[string]$Operation
	)
	& $Executable @Arguments *> $null
	Assert-ExitCode $Operation
}

function Invoke-GlobalInstall {
	param(
		[string[]]$Tarballs,
		[string]$GlobalRoot,
		[string]$LogPath
	)
	for ($attempt = 1; $attempt -le 3; $attempt++) {
		& npm install --global --ignore-scripts --no-audit --no-fund --loglevel=error @Tarballs *> $LogPath
		$status = $LASTEXITCODE
		if ($status -eq 0) {
			Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
			return
		}
		$logText = if (Test-Path -LiteralPath $LogPath) { Get-Content -LiteralPath $LogPath -Raw } else { "" }
		if ($logText -match "EBUSY|EPERM|resource busy|locked" -and $attempt -lt 3) {
			Write-InstallLog "Global npm install hit a Windows file lock; retrying ($($attempt + 1)/3)"
			if (-not (Remove-NpmStaging -PackageRoot (Join-Path $GlobalRoot "@reitaard"))) {
				Write-InstallLog "A temporary npm staging directory is still locked; retrying anyway."
			}
			Start-Sleep -Seconds 2
			continue
		}
		if ($logText) { $logText | Write-Error }
		Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
		Fail-Install "Global npm install failed with exit code $status"
	}
}

function Remove-StaleLegacyShims {
	foreach ($commandName in @("recode", "pi")) {
		$paths = @(& where.exe $commandName 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ })
		foreach ($path in $paths) {
			if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
			$content = Get-Content -LiteralPath $path -Raw -ErrorAction SilentlyContinue
			if ($content -match "@reitaard[\\/]repi-coding-agent[\\/]dist") {
				Write-InstallLog "Removing stale $commandName shim at $path"
				Remove-Item -LiteralPath $path -Force
				$legacyPackage = Join-Path (Split-Path -Parent (Split-Path -Parent $path)) "node_modules/@reitaard/repi-coding-agent"
				if (Test-Path -LiteralPath $legacyPackage) {
					Write-InstallLog "Removing stale package directory at $legacyPackage"
					Remove-Item -LiteralPath $legacyPackage -Recurse -Force
				}
			}
		}
	}
}

function Invoke-GlobalInstaller {
	foreach ($commandName in @("git", "node", "npm", "tar.exe", "taskkill.exe")) {
		if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
			Fail-Install "Required command is missing: $commandName"
		}
	}

	$root = (& git rev-parse --show-toplevel 2>$null).Trim()
	Assert-ExitCode "git rev-parse --show-toplevel"
	Set-Location $root
	if ((& git branch --show-current).Trim() -ne "main") { Fail-Install "Current branch must be main" }
	if ((& git status --porcelain).Trim()) { Fail-Install "Checkout is dirty; use a clean released checkout" }

	$version = (& node -p "require('./package.json').version").Trim()
	if ($version -notmatch '^\d+\.\d+\.\d+$') { Fail-Install "Invalid package version: $version" }
	$commit = (& git rev-parse HEAD).Trim()
	$shortCommit = (& git rev-parse --short HEAD).Trim()
	$globalRoot = (& npm root --global).Trim()
	$globalPrefix = (& npm prefix --global).Trim()
	$agentDir = $env:PI_CODING_AGENT_DIR
	if ([string]::IsNullOrWhiteSpace($agentDir)) { $agentDir = Join-Path $env:USERPROFILE ".pi\agent" }

	Request-RecodeProcessShutdown
	if (-not (Remove-NpmStaging -PackageRoot (Join-Path $globalRoot "@reitaard") -Required)) {
		Fail-Install "A previous npm staging directory is still locked. Close Node/Recode processes and rerun."
	}

	$backupRoot = Join-Path $root "..\recode-backups"
	New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
	$backup = Join-Path $backupRoot "agent-before-recode-$version-$((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')).tar.gz"
	if (Test-Path -LiteralPath $agentDir -PathType Container) {
		Write-InstallLog "Backing up existing sessions and settings to $backup"
		& tar.exe -czf $backup -C (Split-Path -Parent $agentDir) (Split-Path -Leaf $agentDir)
		Assert-ExitCode "agent-data backup"
		if (-not (Test-Path -LiteralPath $backup -PathType Leaf)) { Fail-Install "Agent-data backup was not created" }
	} else {
		Write-InstallLog "No existing agent directory found at $agentDir"
	}

	$outRoot = Join-Path ([IO.Path]::GetTempPath()) "recode-global-$version-$shortCommit"
	$certRoot = Join-Path $outRoot "source"
	if (Test-Path -LiteralPath $outRoot) { Remove-Item -LiteralPath $outRoot -Recurse -Force }
	New-Item -ItemType Directory -Force -Path (Join-Path $outRoot "packages"), (Join-Path $outRoot "smoke") | Out-Null

	try {
		& git -C $root worktree prune
		Remove-Item -LiteralPath $certRoot -Recurse -Force -ErrorAction SilentlyContinue
		& git clone --quiet --no-checkout $root $certRoot
		Assert-ExitCode "git clone"
		& git -C $certRoot checkout --quiet --detach $commit
		Assert-ExitCode "git checkout"

		$packageDirs = @(
			"packages/telemetry",
			"packages/ai",
			"packages/agent",
			"packages/storage/sqlite-node",
			"packages/tui",
			"packages/coding-agent",
			"packages/orchestrator"
		)
		Write-InstallLog "Certifying source commit $commit in an isolated worktree"
		Push-Location $certRoot
		try {
			& npm ci --ignore-scripts --no-audit --no-fund
			Assert-ExitCode "npm ci"
			Invoke-CheckedCommand "npm" @("run", "build") "npm run build"
			Invoke-CheckedCommand "npm" @("run", "check") "npm run check"
			$packLog = Join-Path $outRoot "npm-pack.log"
			foreach ($packageDir in $packageDirs) {
				Push-Location (Join-Path $certRoot $packageDir)
				try {
					& npm pack --ignore-scripts --pack-destination (Join-Path $outRoot "packages") *> $packLog
					if ($LASTEXITCODE -ne 0) {
						Get-Content -LiteralPath $packLog | Write-Error
						Fail-Install "npm pack failed for $packageDir"
					}
				} finally {
					Pop-Location
				}
			}
			Remove-Item -LiteralPath $packLog -Force -ErrorAction SilentlyContinue
		} finally {
			Pop-Location
		}

		$tarballs = @(Get-ChildItem -LiteralPath (Join-Path $outRoot "packages") -File -Filter "*.tgz" | Sort-Object Name)
		if ($tarballs.Count -ne 7) { Fail-Install "Expected seven package tarballs; found $($tarballs.Count)" }
		foreach ($tarball in $tarballs) {
			$contents = & tar.exe -tzf $tarball.FullName
			Assert-ExitCode "inspect $($tarball.Name)"
			if ($contents | Select-String -Quiet -Pattern '\.(node|exe|dll)$') {
				Fail-Install "Package contains an uncertified native binary: $($tarball.Name)"
			}
		}
		$hashLines = foreach ($tarball in $tarballs) {
			$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $tarball.FullName).Hash.ToLowerInvariant()
			"$hash  $($tarball.Name)"
		}
		Set-Content -LiteralPath (Join-Path $outRoot "SHA256SUMS") -Value $hashLines -Encoding ASCII

		Write-InstallLog "Smoke-installing the exact seven-package set"
		$smokeRoot = Join-Path $outRoot "smoke"
		$smokeLog = Join-Path $outRoot "smoke-install.log"
		$tarballPaths = @($tarballs | ForEach-Object { $_.FullName })
		& npm install --global --prefix $smokeRoot --ignore-scripts --no-audit --no-fund --loglevel=error @tarballPaths *> $smokeLog
		if ($LASTEXITCODE -ne 0) {
			Get-Content -LiteralPath $smokeLog | Write-Error
			Fail-Install "Smoke npm install failed"
		}
		Remove-Item -LiteralPath $smokeLog -Force -ErrorAction SilentlyContinue
		[void](Remove-NpmStaging -PackageRoot (Join-Path $smokeRoot "node_modules/@reitaard"))

		$smokeRecode = Join-Path $smokeRoot "recode.cmd"
		$smokePi = Join-Path $smokeRoot "pi.cmd"
		if (-not (Test-Path -LiteralPath $smokeRecode) -or -not (Test-Path -LiteralPath $smokePi)) { Fail-Install "Smoke-install command shims are missing" }
		$smokeVersion = (& $smokeRecode --version 2>&1 | Out-String).Trim()
		if ($LASTEXITCODE -ne 0 -or $smokeVersion -ne $version) { Fail-Install "Smoke-installed recode version was $smokeVersion; expected $version" }
		Invoke-CheckedCommand $smokeRecode @("--help") "smoke recode --help"
		Invoke-CheckedCommand $smokeRecode @("--offline", "--list-models") "smoke recode --offline --list-models"
		Invoke-CheckedCommand $smokePi @("--help") "smoke pi --help"

		$legacyPackage = Join-Path $globalRoot "@reitaard/repi-coding-agent"
		if (Test-Path -LiteralPath $legacyPackage) {
			Write-InstallLog "Removing the previous global coding-agent package after certification and smoke installation"
			Invoke-NpmQuiet (Join-Path $outRoot "legacy-uninstall.log") @("uninstall", "--global", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error", "@reitaard/repi-coding-agent")
		}
		Remove-StaleLegacyShims

		Write-InstallLog "Installing the verified package set into $globalPrefix"
		Invoke-GlobalInstall $tarballPaths $globalRoot (Join-Path $outRoot "global-install.log")
		[void](Remove-NpmStaging -PackageRoot (Join-Path $globalRoot "@reitaard"))

		$manifest = Join-Path $globalRoot "@reitaard/recode-coding-agent/package.json"
		if (-not (Test-Path -LiteralPath $manifest)) { Fail-Install "Installed Recode manifest is missing: $manifest" }
		$installedVersion = (& node -p "require(process.argv[1]).version" $manifest).Trim()
		if ($installedVersion -ne $version) { Fail-Install "Installed version is $installedVersion; expected $version" }
		if (Test-Path -LiteralPath $legacyPackage) { Fail-Install "Legacy RePi coding-agent package remains installed" }

		$globalRecode = Join-Path $globalPrefix "recode.cmd"
		$globalPi = Join-Path $globalPrefix "pi.cmd"
		if (-not (Test-Path -LiteralPath $globalRecode) -or -not (Test-Path -LiteralPath $globalPi)) { Fail-Install "Global command shims are missing" }
		$globalVersion = (& $globalRecode --version 2>&1 | Out-String).Trim()
		if ($LASTEXITCODE -ne 0 -or $globalVersion -ne $version) { Fail-Install "Installed recode version was $globalVersion; expected $version" }
		Invoke-CheckedCommand $globalRecode @("--help") "global recode --help"
		Invoke-CheckedCommand $globalRecode @("--offline", "--list-models") "global recode --offline --list-models"
		Invoke-CheckedCommand $globalPi @("--help") "global pi --help"

		Write-InstallLog "Installed @reitaard/recode-coding-agent@$version"
		Write-InstallLog "Existing data remains at $agentDir"
		if (Test-Path -LiteralPath $backup) { Write-InstallLog "Rollback data backup: $backup" }
		Write-InstallLog "Package evidence: $outRoot"
		Write-InstallLog "Open a new terminal, run 'recode', then run 'pi update' to update extensions."
	} finally {
		if (Test-Path -LiteralPath $certRoot) { Remove-Item -LiteralPath $certRoot -Recurse -Force -ErrorAction SilentlyContinue }
	}
}

try {
	Invoke-GlobalInstaller
} catch {
	Write-Error $_.Exception.Message
	exit 1
}
