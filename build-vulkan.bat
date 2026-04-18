@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
set VULKAN_SDK=C:\VulkanSDK\1.4.341.1
set PATH=%VULKAN_SDK%\Bin;C:\Users\mflma\AppData\Local\Microsoft\WinGet\Packages\Ninja-build.Ninja_Microsoft.Winget.Source_8wekyb3d8bbwe;%PATH%
cd /d C:\Users\mflma\workspace\AInotepad
node node_modules\node-llama-cpp\dist\cli\cli.js source download --release latest --noBundle --noUsageExample --gpu vulkan
echo BUILD EXIT CODE: %ERRORLEVEL%
