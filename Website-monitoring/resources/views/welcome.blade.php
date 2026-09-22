<!doctype html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ config('app.name', 'AquaMonitor') }}</title>
</head>
<body>
    <div id="root"></div>
    @vite('frontend/src/main.tsx')
</body>
</html>
