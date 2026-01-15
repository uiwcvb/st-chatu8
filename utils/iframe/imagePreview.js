// @ts-nocheck
/**
 * 图片预览对话框和下载功能
 */

import { getItemImg, updateImageIndex, deleteImage, getItemBlob, dbs } from '../database.js';
import { showEditDialog } from './dialogs.js';
import { triggerGeneration } from './generation.js';

/**
 * Helper function to safely trigger a download from a blob
 * @param {Blob} blob - 要下载的 Blob
 * @param {string} filename - 下载文件名
 */
export async function downloadBlob(blob, filename) {
    // Use the top window's objects for consistency
    const topDoc = window.top.document;
    const topURL = window.top['URL'];

    if (!topURL) {
        console.error("window.top.URL is not available.");
        toastr.error("浏览器不支持下载功能。");
        return;
    }

    const url = topURL.createObjectURL(blob);
    const link = topDoc.createElement('a');

    link.href = url;
    link.download = filename;

    // The link must be in the document for the click to work on some browsers
    link.style.display = 'none';
    topDoc.body.appendChild(link);

    link.click();

    // Clean up the link element
    topDoc.body.removeChild(link);

    // Use a timeout to ensure the download has started before revoking the URL.
    // This is a crucial step to prevent race conditions and ensure stability.
    setTimeout(() => {
        topURL.revokeObjectURL(url);
    }, 150);
}

/**
 * 显示图片预览对话框
 * @param {HTMLImageElement|HTMLVideoElement} img - 图片或视频元素
 * @param {HTMLButtonElement} button - 按钮元素
 */
export function showImagePreview(img, button) {
    const doc = window.top.document;
    const currentTag = button.dataset.link;

    // Create backdrop
    const backdrop = doc.createElement('div');
    backdrop.className = 'st-chatu8-preview-backdrop';

    // Create dialog
    const dialog = doc.createElement('div');
    dialog.className = 'st-chatu8-preview-dialog';
    dialog.addEventListener('click', (e) => e.stopPropagation());

    const isMobile = window.top.innerWidth <= 768;
    if (isMobile) {
        const topButton = /** @type {HTMLElement | null} */ (window.top.document.querySelector('#ai-config-button'));
        const topMargin = (topButton?.offsetHeight || 0) + 10; // Use top button height as margin, +10px gap

        // The backdrop is a flex container. Align items to the start (top).
        backdrop.style.alignItems = 'flex-start';

        // Apply the margin to the dialog.
        dialog.style.marginTop = `${topMargin}px`;
    }

    // Close button
    const closeButton = doc.createElement('div');
    closeButton.className = 'st-chatu8-preview-close';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => {
        /** @type {HTMLImageElement} */
        const selectedImage = dialog.querySelector('.st-chatu8-preview-large-image');
        if (!selectedImage) {
            backdrop.remove();
            return;
        }
        const newIndex = parseInt(selectedImage.dataset.index, 10);
        updateImageIndex(currentTag, newIndex); // This is async but we don't need to wait

        // The large image uses a temporary blob URL. We need to get the persistent
        // base64 URL from the database to update the image in the chat.
        getItemImg(currentTag, newIndex).then(([newSrc]) => {
            if (newSrc) {
                img.src = newSrc;
            }
        });

        // Revoke all created blob URLs to prevent memory leaks
        const allImagesInDialog = dialog.querySelectorAll('img');
        allImagesInDialog.forEach(imageEl => {
            if (imageEl.src && imageEl.src.startsWith('blob:')) {
                window.top['URL'].revokeObjectURL(imageEl.src);
            }
        });
        backdrop.remove();
    };

    // Image/Video container
    const imageContainer = doc.createElement('div');
    imageContainer.className = 'st-chatu8-preview-image-container';

    // Create a placeholder for the large image/video (will be populated dynamically)
    let largeMedia = null;
    const largeMediaWrapper = doc.createElement('div');
    largeMediaWrapper.className = 'st-chatu8-preview-large-wrapper';
    largeMediaWrapper.style.display = 'flex';
    largeMediaWrapper.style.justifyContent = 'center';
    largeMediaWrapper.style.alignItems = 'center';
    largeMediaWrapper.style.minHeight = '200px';

    imageContainer.appendChild(largeMediaWrapper);

    // Only show navigation buttons on non-mobile devices
    if (!isMobile) {
        const prevButton = doc.createElement('div');
        prevButton.className = 'st-chatu8-preview-nav prev';
        prevButton.innerHTML = '&#10094;';
        prevButton.onclick = () => {
            updateLargeImage((currentIndex - 1 + images.length) % images.length);
        };

        const nextButton = doc.createElement('div');
        nextButton.className = 'st-chatu8-preview-nav next';
        nextButton.innerHTML = '&#10095;';
        nextButton.onclick = () => {
            updateLargeImage((currentIndex + 1) % images.length);
        };

        imageContainer.appendChild(prevButton);
        imageContainer.appendChild(nextButton);
    }

    // Thumbnail container
    const thumbnailContainer = doc.createElement('div');
    thumbnailContainer.className = 'st-chatu8-preview-thumbnail-container';

    // Action buttons container
    const actionContainer = doc.createElement('div');
    actionContainer.className = 'st-chatu8-preview-actions';
    actionContainer.style.textAlign = 'center';
    actionContainer.style.padding = '10px 0';

    const downloadButton = doc.createElement('button');
    downloadButton.textContent = '下载当前媒体';
    downloadButton.className = 'st-chatu8-preview-action-button';
    downloadButton.onclick = async () => {
        try {
            toastr.info('正在准备下载...');
            const blob = await getItemBlob(currentTag, currentIndex);
            if (blob) {
                // 根据当前媒体类型确定扩展名
                const mediaInfo = mediaInfos[currentIndex];
                const ext = (mediaInfo && mediaInfo.isVideo) ? 'mp4' : 'png';
                const filename = `${currentTag.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}-${currentIndex}.${ext}`;
                await downloadBlob(blob, filename);
            } else {
                toastr.error('无法加载图片数据进行下载。');
                console.error('Failed to get image blob for download.');
            }
        } catch (error) {
            toastr.error('下载过程中发生错误。');
            console.error('Error during download:', error);
        }
    };

    const deleteButton = doc.createElement('button');
    deleteButton.textContent = '删除当前图片';
    deleteButton.className = 'st-chatu8-preview-action-button danger';

    actionContainer.appendChild(downloadButton);
    actionContainer.appendChild(deleteButton);

    dialog.appendChild(closeButton);
    dialog.appendChild(imageContainer);
    dialog.appendChild(actionContainer);
    dialog.appendChild(thumbnailContainer);
    backdrop.appendChild(dialog);
    doc.body.appendChild(backdrop);

    let images = [];
    let mediaInfos = []; // 存储每个媒体的 isVideo 信息
    let currentIndex = 0;

    deleteButton.onclick = async () => {
        if (!window.top.confirm('确定要删除这张图片吗？')) {
            return;
        }

        const tag = currentTag;
        const indexToDelete = currentIndex;

        await deleteImage(tag, indexToDelete);
        toastr.success('图片已删除');

        // Re-fetch all images for the tag using merged data
        const md5 = CryptoJS.MD5(tag).toString();
        const merged = await dbs.getMergedAndSortedImages(md5);

        if (merged.images.length === 0) {
            // If all images are gone, close the dialog and update the original chat message
            const parentContainer = img.closest('.st-chatu8-image-container');
            if (parentContainer) {
                parentContainer.remove();
            }
            if (button) {
                button.style.display = 'inline-block';
                button.textContent = '生成图片';
                button.disabled = false;
            }
            backdrop.remove();
            return;
        }

        // 更新 mediaInfos
        mediaInfos = merged.images.map(entry => ({
            isVideo: entry.isVideo || false
        }));

        // 获取原始媒体 blobs
        const blobPromises = merged.images.map(async (imageEntry) => {
            const isVideo = imageEntry.isVideo || false;
            if (imageEntry.source === 'server' && imageEntry.path) {
                try {
                    const response = await fetch(imageEntry.path);
                    if (response.ok) {
                        return await response.blob();
                    }
                } catch (error) {
                    console.error('Failed to fetch media blob:', error);
                }
            } else if (imageEntry.source === 'db' && imageEntry.uuid) {
                const imageData = await dbs.storeReadOnly(imageEntry.uuid);
                if (imageData && imageData.data) {
                    const mimeType = isVideo ? 'video/mp4' : 'image/png';
                    return new Blob([imageData.data], { type: mimeType });
                }
            }
            return null;
        });

        const allBlobs = await Promise.all(blobPromises);
        const validIndices = [];
        images = allBlobs.filter((b, i) => {
            if (b !== null) {
                validIndices.push(i);
                return true;
            }
            return false;
        });
        mediaInfos = validIndices.map(i => mediaInfos[i]);

        // Clear existing thumbnails and revoke old URLs
        thumbnailContainer.querySelectorAll('img').forEach(thumb => {
            if (thumb.src && thumb.src.startsWith('blob:')) {
                window.top['URL'].revokeObjectURL(thumb.src);
            }
        });
        thumbnailContainer.innerHTML = '';

        // Re-populate thumbnails with proper video thumbnail handling
        const filteredMergedImages = validIndices.map(i => merged.images[i]);

        const thumbnailPromises = filteredMergedImages.map(async (imageEntry, index) => {
            const isVideo = imageEntry.isVideo || false;

            if (isVideo) {
                // 优先使用服务器缩略图路径
                if (imageEntry.source === 'server' && imageEntry.thumbnail_path) {
                    try {
                        const response = await fetch(imageEntry.thumbnail_path);
                        if (response.ok) {
                            return await response.blob();
                        }
                    } catch (error) {
                        console.warn('[iframe] Failed to fetch video thumbnail from server:', error);
                    }
                }

                // 其次使用 IndexedDB 中的缩略图
                if (imageEntry.thumbnail_uuid) {
                    const thumbnailBlob = await dbs.getImageThumbnailBlobByUUID(imageEntry.thumbnail_uuid);
                    if (thumbnailBlob) {
                        return thumbnailBlob;
                    }
                }

                return null;
            }

            return images[index];
        });

        const thumbnailBlobs = await Promise.all(thumbnailPromises);

        thumbnailBlobs.forEach((thumbnailBlob, index) => {
            const thumb = doc.createElement('img');
            if (thumbnailBlob) {
                thumb.src = window.top['URL'].createObjectURL(thumbnailBlob);
            } else {
                // 视频没有缩略图时使用占位图
                thumb.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIGZpbGw9IiMxYTFhMmUiLz48cG9seWdvbiBwb2ludHM9IjUwLDQwIDUwLDg4IDkwLDY0IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuNSkiLz48dGV4dCB4PSI2NCIgeT0iMTEwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC41KSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+VklERU88L3RleHQ+PC9zdmc+';
                thumb.alt = 'Video';
            }
            thumb.className = 'st-chatu8-preview-thumbnail';
            thumb.dataset.index = String(index);
            thumb.onclick = () => updateLargeImage(index);
            thumbnailContainer.appendChild(thumb);
        });

        // 删除后重新获取当前应该显示的图片
        if (images.length > 0) {
            let newIndex = currentIndex;
            if (newIndex >= images.length) {
                newIndex = images.length - 1;
            }
            updateLargeImage(newIndex);

            // 同时更新聊天中的图片
            const [newImgSrc] = await getItemImg(tag, newIndex);
            if (newImgSrc) {
                img.src = newImgSrc;
            }
        }
    };

    async function updateLargeImage(index) {
        if (index >= 0 && index < images.length) {
            currentIndex = index;

            // Remove previous large media element
            if (largeMedia) {
                if (largeMedia.src && largeMedia.src.startsWith('blob:')) {
                    window.top['URL'].revokeObjectURL(largeMedia.src);
                }
                largeMedia.remove();
            }

            const blob = images[index];
            const mediaInfo = mediaInfos[index];
            const isVideo = mediaInfo && mediaInfo.isVideo;

            if (blob) {
                const blobUrl = window.top['URL'].createObjectURL(blob);

                if (isVideo) {
                    // 创建视频元素
                    largeMedia = doc.createElement('video');
                    largeMedia.src = blobUrl;
                    largeMedia.controls = true;
                    largeMedia.loop = true;
                    largeMedia.muted = true;
                    largeMedia.playsInline = true;
                    largeMedia.autoplay = true;
                    largeMedia.className = 'st-chatu8-preview-large-image';
                    largeMedia.style.maxWidth = '100%';
                    largeMedia.style.maxHeight = '60vh';

                    // 添加错误处理
                    largeMedia.onerror = function () {
                        console.warn('[iframe] Preview video cannot be played');
                        const fallback = doc.createElement('div');
                        fallback.style.cssText = `
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                            border-radius: 8px;
                            padding: 40px;
                            min-height: 200px;
                            color: #fff;
                            text-align: center;
                        `;
                        fallback.innerHTML = `
                            <div style="font-size: 64px; margin-bottom: 15px;">🎬</div>
                            <div style="margin-bottom: 15px; opacity: 0.8;">视频格式不支持浏览器播放</div>
                            <a href="${blobUrl}" download="video.mp4" 
                               style="background: rgba(255,255,255,0.2); padding: 12px 24px; border-radius: 4px; color: #fff; text-decoration: none;"
                               onclick="event.stopPropagation()">
                                📥 下载视频
                            </a>
                        `;
                        fallback.className = 'st-chatu8-preview-large-image';
                        fallback.dataset.index = String(index);
                        if (largeMedia.parentNode) {
                            largeMedia.parentNode.replaceChild(fallback, largeMedia);
                            largeMedia = fallback;
                        }
                    };
                } else {
                    // 创建图片元素
                    largeMedia = doc.createElement('img');
                    largeMedia.src = blobUrl;
                    largeMedia.className = 'st-chatu8-preview-large-image';
                }

                largeMedia.dataset.index = String(index);
                largeMediaWrapper.appendChild(largeMedia);
            } else {
                console.error(`Could not find media blob in array for index ${index}`);
            }

            /** @type {NodeListOf<HTMLImageElement>} */
            const thumbnails = thumbnailContainer.querySelectorAll('.st-chatu8-preview-thumbnail');
            thumbnails.forEach((thumb, i) => {
                if (i === index) {
                    thumb.classList.add('active');
                } else {
                    thumb.classList.remove('active');
                }
            });
            if (thumbnails[index]) {
                thumbnails[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }

    // Click handlers for prev/next buttons are now inside the !isMobile block

    // 使用合并排序后的图片数组
    (async () => {
        const md5 = CryptoJS.MD5(currentTag).toString();
        const merged = await dbs.getMergedAndSortedImages(md5);

        if (merged.images.length === 0) {
            return;
        }

        // 填充 mediaInfos 数组
        mediaInfos = merged.images.map(entry => ({
            isVideo: entry.isVideo || false
        }));

        // 按时间排序后，获取每个图片/视频的 Blob
        const blobPromises = merged.images.map(async (imageEntry) => {
            const isVideo = imageEntry.isVideo || false;
            if (imageEntry.source === 'server' && imageEntry.path) {
                try {
                    const response = await fetch(imageEntry.path);
                    if (response.ok) {
                        return await response.blob();
                    }
                } catch (error) {
                    console.error('Failed to fetch media blob:', error);
                }
            } else if (imageEntry.source === 'db' && imageEntry.uuid) {
                const imageData = await dbs.storeReadOnly(imageEntry.uuid);
                if (imageData && imageData.data) {
                    // 根据是否为视频设置正确的 MIME 类型
                    const mimeType = isVideo ? 'video/mp4' : 'image/png';
                    return new Blob([imageData.data], { type: mimeType });
                }
            }
            return null;
        });

        const allBlobs = await Promise.all(blobPromises);

        // 过滤掉 null 值，同时保持 mediaInfos 同步
        const validIndices = [];
        images = allBlobs.filter((b, i) => {
            if (b !== null) {
                validIndices.push(i);
                return true;
            }
            return false;
        });
        mediaInfos = validIndices.map(i => mediaInfos[i]);

        if (images.length > 0) {
            // 获取正确的缩略图：视频需要使用 thumbnail_uuid 或 thumbnail_path，图片可以直接使用原图
            const filteredMergedImages = validIndices.map(i => merged.images[i]);

            const thumbnailPromises = filteredMergedImages.map(async (imageEntry, index) => {
                const isVideo = imageEntry.isVideo || false;

                // 如果是视频，必须使用缩略图
                if (isVideo) {
                    // 优先使用服务器缩略图路径
                    if (imageEntry.source === 'server' && imageEntry.thumbnail_path) {
                        try {
                            const response = await fetch(imageEntry.thumbnail_path);
                            if (response.ok) {
                                return await response.blob();
                            }
                        } catch (error) {
                            console.warn('[iframe] Failed to fetch video thumbnail from server:', error);
                        }
                    }

                    // 其次使用 IndexedDB 中的缩略图
                    if (imageEntry.thumbnail_uuid) {
                        const thumbnailBlob = await dbs.getImageThumbnailBlobByUUID(imageEntry.thumbnail_uuid);
                        if (thumbnailBlob) {
                            return thumbnailBlob;
                        }
                    }

                    // 没有缩略图，返回 null（会使用默认占位图）
                    console.warn('[iframe] No thumbnail available for video, index:', index);
                    return null;
                }

                // 图片可以直接使用原图作为缩略图
                return images[index];
            });

            const thumbnailBlobs = await Promise.all(thumbnailPromises);

            thumbnailBlobs.forEach((thumbnailBlob, index) => {
                const thumb = doc.createElement('img');
                if (thumbnailBlob) {
                    thumb.src = window.top['URL'].createObjectURL(thumbnailBlob);
                } else {
                    // 视频没有缩略图时使用占位图
                    thumb.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIGZpbGw9IiMxYTFhMmUiLz48cG9seWdvbiBwb2ludHM9IjUwLDQwIDUwLDg4IDkwLDY0IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuNSkiLz48dGV4dCB4PSI2NCIgeT0iMTEwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC41KSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+VklERU88L3RleHQ+PC9zdmc+';
                    thumb.alt = 'Video';
                }
                thumb.className = 'st-chatu8-preview-thumbnail';
                thumb.dataset.index = String(index);
                thumb.onclick = () => updateLargeImage(index);
                thumbnailContainer.appendChild(thumb);
            });

            // 使用合并后的 currentIndex
            updateLargeImage(merged.currentIndex);
        }
    })();
}
