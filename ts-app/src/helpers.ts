import seedrandom from 'seedrandom';

export function isValidURL(url: string): boolean {
    const urlRegex = /^(http|https):\/\/[^ "]+$/;
    return urlRegex.test(url);
}

export function addOrUpdateQueryParams(url: string, paramName: string, paramValue: string): string {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    params.set(paramName, paramValue);
    urlObj.search = params.toString();
    return urlObj.toString();
}

export function makeHashStringUsingPRNG(prng: seedrandom.PRNG): string {
    const chars = '0123456789abcdef';
    let hash: string = '0x';
    for (let i = 64; i > 0; --i) hash += chars[Math.floor(prng() * chars.length)];
    return hash;
}
