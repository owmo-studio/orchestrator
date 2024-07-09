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
