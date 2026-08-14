# Changelog

## 0.1.2

- Added the `pi` compatibility command for installing and managing packages from the existing Pi ecosystem.
- Kept `recode` as the primary command for Aizen, Maestro, and Recode application updates.
- Made bare `pi update` update installed packages while bare `recode update` continues to target Recode itself.
- Disabled Jiti's shared filesystem cache to prevent Windows `EPERM` failures when loading extensions.
