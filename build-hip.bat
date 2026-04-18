@echo off
REM Build llama.cpp with AMD HIP/ROCm support for node-llama-cpp
REM ROCm 7.2.1 extracted from Python wheels at C:\rocm_sdk\

set HIP_PATH=C:\rocm_sdk\core\_rocm_sdk_core
set CLANG=%HIP_PATH%\lib\llvm\bin\amdclang.exe
set CLANGXX=%HIP_PATH%\lib\llvm\bin\amdclang++.exe

if not exist "%HIP_PATH%\include\hip\hip_runtime.h" (
    echo ERROR: HIP headers not found at %HIP_PATH%
    exit /b 1
)

echo Using HIP SDK at: %HIP_PATH%
set PATH=%HIP_PATH%\bin;%HIP_PATH%\lib\llvm\bin;%PATH%

REM Ninja for faster builds
set NINJA_PATH=C:\Users\mflma\AppData\Local\Microsoft\WinGet\Packages\Ninja-build.Ninja_Microsoft.Winget.Source_8wekyb3d8bbwe
set PATH=%NINJA_PATH%;%PATH%

REM Load MSVC for linker (amdclang uses MSVC linker on Windows)
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

REM Use junction for shorter path (avoids Windows MAX_PATH issues)
if not exist C:\nlc mklink /J C:\nlc "C:\Users\mflma\workspace\AInotepad\node_modules\node-llama-cpp"

REM Clear old HIP build
rmdir /s /q "C:\nlc\llama\localBuilds\win-x64-hip-release-b8816" 2>nul
rmdir /s /q "C:\nlc\llama\localBuilds\win-x64-cuda-release-b8816" 2>nul

REM cmake-js build with HIP
set CMAKE_PATH=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe
set CMAKEJS=C:\Users\mflma\workspace\AInotepad\node_modules\.bin\cmake-js.cmd

pushd C:\nlc\llama
"%CMAKEJS%" compile --log-level warn --config Release --arch=x64 ^
  --out "localBuilds\win-x64-cuda-release-b8816" ^
  --runtime-version=24.14.0 --parallel=14 ^
  --generator Ninja ^
  --cmake-path "%CMAKE_PATH%" ^
  --CDGGML_BUILD_NUMBER=1 ^
  --CDCMAKE_CONFIGURATION_TYPES=Release ^
  --CDNLC_CURRENT_PLATFORM=win-x64 ^
  --CDNLC_TARGET_PLATFORM=win-x64 ^
  --CDNLC_VARIANT=cuda.b8816 ^
  --CDGGML_METAL=OFF ^
  --CDGGML_HIP=ON ^
  --CDGGML_CUDA=OFF ^
  "--CDCMAKE_C_COMPILER=%CLANG%" ^
  "--CDCMAKE_CXX_COMPILER=%CLANGXX%" ^
  "--DDHIP_PATH=%HIP_PATH%" ^
  "--CDGPU_TARGETS=gfx1100" ^
  --CDGGML_CCACHE=OFF ^
  --CDLLAMA_CURL=OFF ^
  --CDLLAMA_HTTPLIB=OFF ^
  --CDLLAMA_BUILD_BORINGSSL=OFF ^
  --CDLLAMA_OPENSSL=OFF
popd

if %ERRORLEVEL% neq 0 (
    echo HIP build failed with error %ERRORLEVEL%
    exit /b 1
)

REM Create Release layout matching node-llama-cpp expectations
set BUILD_DIR=C:\Users\mflma\workspace\AInotepad\node_modules\node-llama-cpp\llama\localBuilds\win-x64-cuda-release-b8816
mkdir "%BUILD_DIR%\Release" 2>nul
copy "%BUILD_DIR%\llama-addon.node" "%BUILD_DIR%\Release\" >nul 2>&1
xcopy /Y "%BUILD_DIR%\bin\*.dll" "%BUILD_DIR%\Release\" >nul 2>&1

REM Copy ROCm 7.x runtime DLLs
set ROCM_CORE=C:\rocm_sdk\core\_rocm_sdk_core
xcopy /Y "%ROCM_CORE%\bin\amdhip64_7.dll" "%BUILD_DIR%\Release\" >nul
xcopy /Y "%ROCM_CORE%\bin\hiprtc0702.dll" "%BUILD_DIR%\Release\" >nul 2>&1
xcopy /Y "%ROCM_CORE%\bin\amd_comgr*.dll" "%BUILD_DIR%\Release\" >nul 2>&1

REM Write required metadata files
echo {"buildOptions":{"customCmakeOptions":{},"progressLogs":true,"platform":"win","platformInfo":{"name":"Windows","version":"10.0.26200"},"arch":"x64","gpu":"cuda","llamaCpp":{"repo":"ggml-org/llama.cpp","release":"b8816"}}} > "%BUILD_DIR%\Release\_nlcBuildMetadata.json"
echo. > "%BUILD_DIR%\buildDone.status"

REM Update lastBuild.json to use HIP build
echo {"folderName":"win-x64-cuda-release-b8816"} > "C:\Users\mflma\workspace\AInotepad\node_modules\node-llama-cpp\llama\lastBuild.json"

echo.
echo HIP build complete!
echo Run: cd C:\Users\mflma\workspace\AInotepad ^&^& npm run postinstall
echo Then restart the app.
