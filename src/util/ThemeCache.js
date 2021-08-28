// @flow

import { asMap, asNumber, asObject, uncleaner } from 'cleaners'
import { Disklet } from 'disklet'
import { ImageSourcePropType, Platform } from 'react-native'
import RNFS from 'react-native-fs'

const directory = Platform.OS === 'ios' ? RNFS.DocumentDirectoryPath : RNFS.ExternalCachesDirectoryPath

const THEME_CACHE_FILE_NAME = 'themeCache.json'
const EDGE_CONTENT_SERVER = 'https://content.edge.app'

const asThemeCache = asMap(asObject({ start: asNumber, expiration: asNumber }))
const wasThemeCache = uncleaner(asThemeCache)
type ThemeCache = $Call<typeof asThemeCache>

type ItemTimestamps = { start: number, expiration: number }

async function getThemeCache(disklet: Disklet): Promise<ThemeCache> {
  const data = await disklet.getText(THEME_CACHE_FILE_NAME)
  return asThemeCache(JSON.parse(data))
}

async function setThemeCache(disklet: Disklet, data: ThemeCache): Promise<void> {
  const text = JSON.stringify(wasThemeCache(data))
  await disklet.setText(THEME_CACHE_FILE_NAME, text)
}

const getThemeItemTimestamps = async (url: string): Promise<ItemTimestamps> => {
  const response = await fetch(url, { method: 'HEAD' })
  const start = response.headers.get('x-amz-meta-start-date') // '2021-08-26T01:37:50Z'
  const expiration = response.headers.get('x-amz-meta-expiration-date') // '2021-08-29T01:37:50Z'
  if (start == null || expiration == null) throw new Error('Failed to find file on CDN')
  return { start: Date.parse(start), expiration: Date.parse(expiration) }
}

const downloadFile = async (disklet: Disklet, fromUrl: string, toFile: string): Promise<void> => {
  // See if the server even has an image for us in the first place:
  const cache: ThemeCache = await getThemeCache(disklet).catch(() => ({}))
  const { start, expiration } = await getThemeItemTimestamps(fromUrl)
  if (expiration < Date.now()) return
  if (cache[fromUrl] != null && cache[fromUrl].start === start && cache[fromUrl].expiration === expiration) return

  // Download file whenever local file timestamps do not equal remote file timestamps
  const download = RNFS.downloadFile({ fromUrl, toFile })
  const status = await download.promise
  if (status.statusCode !== 200) throw new Error('Failed to download')
  cache[fromUrl] = { start, expiration }
  await setThemeCache(disklet, cache)
}

export async function getBackgroundImage(disklet: Disklet, fallback: ImageSourcePropType): Promise<ImageSourcePropType> {
  const BACKGROUND_IMAGE_FILE_NAME = 'login_bg.gif'
  const BACKGROUND_IMAGE_URL = `${EDGE_CONTENT_SERVER}/${BACKGROUND_IMAGE_FILE_NAME}`
  const BACKGROUND_IMAGE_LOCAL_URI = `file://${directory}/${BACKGROUND_IMAGE_FILE_NAME}`
  const now = Date.now()
  let image = fallback

  const cache: ThemeCache = await getThemeCache(disklet).catch(() => ({}))
  if (
    cache[BACKGROUND_IMAGE_URL] != null &&
    cache[BACKGROUND_IMAGE_URL].start < now &&
    cache[BACKGROUND_IMAGE_URL].expiration > now &&
    (await RNFS.exists(BACKGROUND_IMAGE_LOCAL_URI))
  ) {
    image = { uri: BACKGROUND_IMAGE_LOCAL_URI }
  }
  // Always return existing local file but query and download new remote file in the background
  downloadFile(disklet, BACKGROUND_IMAGE_URL, BACKGROUND_IMAGE_LOCAL_URI).catch(() => {
    console.warn(`Error downloading ${BACKGROUND_IMAGE_LOCAL_URI}`)
  })
  return image
}
