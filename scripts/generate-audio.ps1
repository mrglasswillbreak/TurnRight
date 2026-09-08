$ErrorActionPreference = 'Stop'
$taskAudioPath = Join-Path $PSScriptRoot '../data/audio'
New-Item -ItemType Directory -Force $taskAudioPath | Out-Null
Add-Type -AssemblyName System.Speech
$taskSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$taskSynth.SelectVoice('Microsoft Hazel Desktop')
$taskSynth.Rate = -1
$taskPhrases = [ordered]@{
 'depart' = 'Start walking along the highlighted route.'
 'left' = 'Turn left.'
 'right' = 'Turn right.'
 'slight-left' = 'Bear left.'
 'slight-right' = 'Bear right.'
 'uturn' = 'Turn around when you can safely do so.'
 'straight' = 'Continue straight.'
 'arrive' = 'You have reached the end of the mapped route.'
 'approach' = 'The building is nearby. Its entrance has not been verified.'
 'reroute' = 'Updating your walking route.'
 'weak' = 'Location signal is weak. Directions will resume when it improves.'
 'ready' = 'Voice directions are on.'
 'then' = 'Then'
 'in-10' = 'In ten metres.'
 'in-20' = 'In twenty metres.'
 'in-30' = 'In thirty metres.'
 'in-50' = 'In fifty metres.'
 'in-100' = 'In one hundred metres.'
 'in-200' = 'In two hundred metres.'
}
foreach ($taskPhrase in $taskPhrases.GetEnumerator()) {
 $taskWave = Join-Path $taskAudioPath ($taskPhrase.Key + '.wav')
 $taskFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
 $taskSynth.SetOutputToWaveFile($taskWave, $taskFormat)
 $taskSynth.Speak($taskPhrase.Value)
 $taskSynth.SetOutputToNull()
}
$taskSynth.Dispose()
$taskPhrases | ConvertTo-Json | Set-Content (Join-Path $taskAudioPath 'transcript.json')
Write-Output "Generated $($taskPhrases.Count) offline speech clips."
