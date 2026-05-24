$ErrorActionPreference = 'Continue'
$outDir = "D:\Users\user22\Documents\CalaveraRiches\new-assets"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$base = "https://image.pollinations.ai/prompt/"
$ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()

# Tight style descriptor for consistency across all 12 symbols
$styleBase = "Mexican Day of the Dead Dia de los Muertos style, vibrant saturated pink orange turquoise magenta gold colors, intricate detailed ornamental decoration with marigold flowers and sugar skull patterns, isolated centered on dark warm red brown background, cinematic warm rim lighting, premium 3D rendered polished slot machine game icon, festive carnival mood, sharp clean edges, no frame no border, photorealistic quality, professional casino game asset"

$styleLetter = "Large stylized ornate letter sculpted with vibrant marigold flowers and sugar skull patterns covering it, ceramic surface texture, glowing colored, $styleBase"

$assets = @(
    @{ name = "ten";      prompt = "Large stylized number '10' sculpted with vibrant marigold flowers and sugar skull patterns covering it, glowing golden yellow color, $styleBase"; seed = ($ts + 101) }
    @{ name = "jack";     prompt = "Large stylized letter 'J' $styleLetter, magenta pink dominant color"; seed = ($ts + 102) }
    @{ name = "queen";    prompt = "Large stylized letter 'Q' $styleLetter, turquoise teal dominant color"; seed = ($ts + 103) }
    @{ name = "king";     prompt = "Large stylized letter 'K' $styleLetter, vibrant green dominant color"; seed = ($ts + 104) }
    @{ name = "ace";      prompt = "Large stylized letter 'A' $styleLetter, orange red dominant color"; seed = ($ts + 105) }
    @{ name = "roses";    prompt = "A beautiful bouquet of red roses combined with vibrant marigold flowers wrapped with decorative ribbons, $styleBase"; seed = ($ts + 111) }
    @{ name = "maracas";  prompt = "A pair of vibrant colorful Mexican maracas with decorative geometric ribbon patterns crossed in X shape, $styleBase"; seed = ($ts + 112) }
    @{ name = "guitar";   prompt = "An ornate Mexican acoustic guitar decorated with marigold flowers and gold trim engravings, $styleBase"; seed = ($ts + 113) }
    @{ name = "skull";    prompt = "A decorated sugar skull calavera with intricate floral patterns and marigold flowers covering it, $styleBase"; seed = ($ts + 114) }
    @{ name = "mariachi"; prompt = "A Mexican mariachi musician skeleton character wearing a large decorated sombrero hat and elegant festive costume holding a guitar, $styleBase"; seed = ($ts + 115) }
    @{ name = "catrina";  prompt = "An elegant Catrina skeleton lady wearing a large marigold flower crown and ornate floral festive dress, $styleBase"; seed = ($ts + 116) }
    @{ name = "coffin";   prompt = "An ornate golden coffin tomb decorated with marigold flowers and gem stones, gleaming gold metal with vibrant floral accents, $styleBase"; seed = ($ts + 117) }
)

foreach ($asset in $assets) {
    $name = $asset.name
    $promptEnc = [uri]::EscapeDataString($asset.prompt)
    $seed = $asset.seed
    $url = "$base$promptEnc`?width=768&height=768&model=flux&nologo=true&seed=$seed"
    $outFile = Join-Path $outDir "$name.png"
    Write-Host "Downloading $name..." -NoNewline
    try {
        Invoke-WebRequest -Uri $url -OutFile $outFile -UseBasicParsing -TimeoutSec 150
        $size = (Get-Item $outFile).Length
        Write-Host " OK ($([math]::Round($size/1KB,1)) KB)"
    } catch {
        Write-Host " FAILED: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "Done."
