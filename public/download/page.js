// Download buttons come only from the confirmed published-artifact manifest.
fetch('release.json')
  .then((r) => {
    if (!r.ok) throw Error('No release manifest');
    return r.json();
  })
  .then((release) => {
    document.getElementById('version').textContent = `Version ${release.version}`;
    for (const platform of ['windows', 'android']) {
      const artifacts = (release.artifacts || []).filter(
        (a) => a.platform === platform && a.url.startsWith('https://github.com/'),
      );
      if (!artifacts.length) continue;
      document.getElementById(`${platform}-status`).textContent =
        platform === 'android'
          ? 'ARM64 APK. Signed release for direct installation.'
          : 'Windows x64 installers. Unsigned public beta.';
      for (const artifact of artifacts) {
        const a = document.createElement('a');
        a.className = 'download';
        a.href = artifact.url;
        a.textContent = `${artifact.label} · ${(artifact.bytes / 1048576).toFixed(1)} MB`;
        document.getElementById(`${platform}-links`).append(a);
      }
    }
    if (release.releaseUrl?.startsWith('https://github.com/')) {
      const a = document.getElementById('release-link');
      a.href = release.releaseUrl;
      a.hidden = false;
    }
  })
  .catch(() => {});
