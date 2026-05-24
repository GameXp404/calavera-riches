$ErrorActionPreference = 'Continue'
$outDir = "D:\Users\user22\Documents\CalaveraRiches\public\assets\img"
$base = "https://image.pollinations.ai/prompt/"
$ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()

$styleIcon = "centered isolated on warm dark red background, vibrant saturated Mexican Day of the Dead Dia de los Muertos style, ornate decorated with marigold flower patterns, vibrant pink orange turquoise magenta gold colors, 3D rendered polished premium casino slot machine game icon, cinematic rim lighting, festive carnival mood, no frame no border, sharp clean edges, professional game asset"
$styleLetter = "in vibrant Mexican Day of the Dead floral ornate style, ornate decorated letter with marigold flowers and sugar skull patterns, glowing saturated colored ceramic surface, isolated centered on dark warm red background, premium slot symbol, 3D rendered polished, no frame no border, festive carnival"

$assets = @(
    @{ name = "ten";     prompt = "Large stylized number '10' $styleLetter, bright yellow gold color"; seed = ($ts + 1) }
    @{ name = "jack";    prompt = "Large stylized letter 'J' $styleLetter, magenta pink color"; seed = ($ts + 2) }
    @{ name = "queen";   prompt = "Large stylized letter 'Q' $styleLetter, turquoise teal color"; seed = ($ts + 3) }
    @{ name = "king";    prompt = "Large stylized letter 'K' $styleLetter, vibrant green color"; seed = ($ts + 4) }
    @{ name = "ace";     prompt = "Large stylized letter 'A' $styleLetter, orange red color"; seed = ($ts + 5) }
    @{ name = "roses";   prompt = "A beautiful red rose bouquet with marigold flowers and ribbons $styleIcon"; seed = ($ts + 6) }
    @{ name = "maracas"; prompt = "A vibrant pair of colorful maracas with decorative ribbon patterns Mexican fiesta $styleIcon"; seed = ($ts + 7) }
    @{ name = "guitar";  prompt = "An ornate Mexican guitar guitarron with floral decorations gold trim $styleIcon"; seed = ($ts + 8) }
    @{ name = "skull";   prompt = "A decorated sugar skull calavera with intricate floral patterns vibrant magenta orange turquoise $styleIcon"; seed = ($ts + 9) }
    @{ name = "mariachi"; prompt = "A Mexican mariachi skeleton character with sombrero hat and guitar Day of the Dead festive $styleIcon"; seed = ($ts + 10) }
    @{ name = "catrina"; prompt = "An elegant Catrina skeleton lady with marigold flower crown and ornate floral dress Day of the Dead wild symbol $styleIcon"; seed = ($ts + 11) }
    @{ name = "coffin";  prompt = "An ornate golden coffin tomb decorated with marigold flowers and gems Day of the Dead scatter symbol $styleIcon"; seed = ($ts + 12) }
    @{ name = "background"; prompt = "Vibrant Mexican Day of the Dead Dia de los Muertos festival street scene with colorful papel picado paper banners marigold flowers warm sunset cinematic atmospheric background no characters no people festive village fiesta"; seed = ($ts + 13); width = 800; height = 600 }
)

foreach ($asset in $assets) {
    $name = $asset.name
    $width = if ($asset.width) { $asset.width } else { 512 }
    $height = if ($asset.height) { $asset.height } else { 512 }
    $promptEnc = [uri]::EscapeDataString($asset.prompt)
    $seed = $asset.seed
    $url = "$base$promptEnc`?width=$width&height=$height&model=flux&nologo=true&seed=$seed"
    $outFile = Join-Path $outDir "$name.png"
    Write-Host "Downloading $name..." -NoNewline
    try {
        Invoke-WebRequest -Uri $url -OutFile $outFile -UseBasicParsing -TimeoutSec 120
        $size = (Get-Item $outFile).Length
        Write-Host " OK ($([math]::Round($size/1KB,1)) KB)"
    } catch {
        Write-Host " FAILED: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "Done."
