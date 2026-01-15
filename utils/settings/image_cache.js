// @ts-nocheck
import { extension_settings } from "../../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../../script.js";
import { extensionName } from '../config.js';
import { getAllImageMetadata, deleteMultipleImages, deleteImagesByUuids, getImageBlobByUUID, getImageThumbnailBlobByUUID, syncServerImagesWithStorage } from '../database.js';
import { stylishConfirm } from '../ui_common.js';

let allCachedImages = [];
let imageCacheCurrentPage = 1;
const imageCacheItemsPerPage = 15;
let selectedImages = new Set();
let imageObserver;
let isMultiSelectMode = false;

function showCacheImagePreview(initialUUID) {
    const doc = document;

    // 找到当前图片在列表中的索引
    let currentIndex = allCachedImages.findIndex(img => img.uuid === initialUUID);
    if (currentIndex === -1) currentIndex = 0;

    const backdrop = doc.createElement('div');
    backdrop.className = 'st-chatu8-preview-backdrop';

    const dialog = doc.createElement('div');
    dialog.className = 'st-chatu8-preview-dialog';
    dialog.addEventListener('click', (e) => e.stopPropagation());

    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const topButton = doc.querySelector('#ai-config-button');
        const topMargin = (topButton?.offsetHeight || 0) + 10;
        backdrop.style.alignItems = 'flex-start';
        dialog.style.marginTop = `${topMargin}px`;
    }

    const closeButton = doc.createElement('div');
    closeButton.className = 'st-chatu8-preview-close';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => {
        doc.removeEventListener('keydown', handleKeyDown);
        if (largeMedia && largeMedia.src && largeMedia.src.startsWith('blob:')) {
            URL.revokeObjectURL(largeMedia.src);
        }
        backdrop.remove();
    };

    const imageContainer = doc.createElement('div');
    imageContainer.className = 'st-chatu8-preview-image-container';
    imageContainer.style.position = 'relative';

    // 创建左右导航按钮
    const navButtonStyle = `
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(0, 0, 0, 0.6);
        color: white;
        border: none;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        transition: background 0.2s;
    `;

    const prevButton = doc.createElement('button');
    prevButton.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prevButton.style.cssText = navButtonStyle + 'left: 10px;';
    prevButton.title = '上一张 (←)';
    prevButton.onmouseenter = () => prevButton.style.background = 'rgba(0, 0, 0, 0.8)';
    prevButton.onmouseleave = () => prevButton.style.background = 'rgba(0, 0, 0, 0.6)';
    prevButton.onclick = () => navigateTo(currentIndex - 1);

    const nextButton = doc.createElement('button');
    nextButton.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    nextButton.style.cssText = navButtonStyle + 'right: 10px;';
    nextButton.title = '下一张 (→)';
    nextButton.onmouseenter = () => nextButton.style.background = 'rgba(0, 0, 0, 0.8)';
    nextButton.onmouseleave = () => nextButton.style.background = 'rgba(0, 0, 0, 0.6)';
    nextButton.onclick = () => navigateTo(currentIndex + 1);

    // 创建媒体容器
    const largeMediaWrapper = doc.createElement('div');
    largeMediaWrapper.style.cssText = 'display: flex; justify-content: center; align-items: center; min-height: 200px;';
    let largeMedia = null;

    // 创建索引指示器
    const indexIndicator = doc.createElement('div');
    indexIndicator.style.cssText = `
        text-align: center;
        color: #888;
        font-size: 12px;
        margin-top: 8px;
    `;

    imageContainer.appendChild(prevButton);
    imageContainer.appendChild(largeMediaWrapper);
    imageContainer.appendChild(nextButton);
    imageContainer.appendChild(indexIndicator);

    const actionContainer = doc.createElement('div');
    actionContainer.className = 'st-chatu8-preview-actions';
    actionContainer.style.textAlign = 'center';
    actionContainer.style.padding = '10px 0';

    const downloadButton = doc.createElement('button');
    downloadButton.textContent = '下载当前媒体';
    downloadButton.className = 'st-chatu8-preview-action-button';
    downloadButton.onclick = async () => {
        const uuid = largeMedia?.dataset.uuid;
        const source = largeMedia?.dataset.source;
        const path = largeMedia?.dataset.path;
        const isVideo = largeMedia?.dataset.isVideo === 'true';

        let blob;
        if (source === 'server' && path) {
            try {
                const response = await fetch(path);
                if (response.ok) {
                    blob = await response.blob();
                }
            } catch (error) {
                console.error('Failed to fetch media from server:', error);
            }
        } else {
            blob = await getImageBlobByUUID(uuid);
        }

        if (blob) {
            const url = URL.createObjectURL(blob);
            const link = doc.createElement('a');
            link.href = url;
            const ext = isVideo ? 'mp4' : 'png';
            link.download = `${uuid}.${ext}`;
            doc.body.appendChild(link);
            link.click();
            doc.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            alert('无法加载媒体数据进行下载。');
        }
    };

    const deleteButton = doc.createElement('button');
    deleteButton.textContent = '删除当前媒体';
    deleteButton.className = 'st-chatu8-preview-action-button danger';

    actionContainer.appendChild(downloadButton);
    actionContainer.appendChild(deleteButton);

    dialog.appendChild(closeButton);
    dialog.appendChild(imageContainer);
    dialog.appendChild(actionContainer);
    backdrop.appendChild(dialog);
    doc.body.appendChild(backdrop);

    // 更新导航按钮状态
    function updateNavButtons() {
        prevButton.style.visibility = currentIndex > 0 ? 'visible' : 'hidden';
        nextButton.style.visibility = currentIndex < allCachedImages.length - 1 ? 'visible' : 'hidden';
        indexIndicator.textContent = `${currentIndex + 1} / ${allCachedImages.length}`;
    }

    // 导航到指定索引
    function navigateTo(newIndex) {
        if (newIndex < 0 || newIndex >= allCachedImages.length) return;
        currentIndex = newIndex;
        const targetUUID = allCachedImages[currentIndex].uuid;
        loadImage(targetUUID);
        updateNavButtons();
    }

    // 键盘事件处理
    function handleKeyDown(e) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateTo(currentIndex - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateTo(currentIndex + 1);
        } else if (e.key === 'Escape') {
            closeButton.onclick();
        }
    }
    doc.addEventListener('keydown', handleKeyDown);

    deleteButton.onclick = async () => {
        if (!confirm('确定要删除这个媒体吗？')) {
            return;
        }

        const uuidToDelete = largeMedia?.dataset.uuid;
        if (!uuidToDelete) return;

        await deleteImagesByUuids([uuidToDelete]);
        toastr.success('媒体已删除');

        const itemInGrid = doc.querySelector(`.st-chatu8-image-cache-item[data-uuid="${uuidToDelete}"]`);
        if (itemInGrid) itemInGrid.remove();

        const indexInAll = allCachedImages.findIndex(img => img.uuid === uuidToDelete);
        if (indexInAll > -1) {
            allCachedImages.splice(indexInAll, 1);
        }

        // 如果还有图片，导航到下一张或上一张
        if (allCachedImages.length > 0) {
            if (currentIndex >= allCachedImages.length) {
                currentIndex = allCachedImages.length - 1;
            }
            navigateTo(currentIndex);
            updateImageCacheInfo();
        } else {
            doc.removeEventListener('keydown', handleKeyDown);
            backdrop.remove();
            updateImageCacheInfo();
        }
    };

    async function loadImage(uuid) {
        // 从 allCachedImages 中找到对应的图片信息
        const imageInfo = allCachedImages.find(img => img.uuid === uuid);
        const isVideo = imageInfo?.isVideo || false;

        let blob;
        if (imageInfo && imageInfo.source === 'server' && imageInfo.path) {
            // 服务器图片：从路径加载
            try {
                const response = await fetch(imageInfo.path);
                if (response.ok) {
                    blob = await response.blob();
                }
            } catch (error) {
                console.error('Failed to fetch media from server:', error);
            }
        } else {
            // IndexedDB 图片/视频：使用 UUID 加载
            blob = await getImageBlobByUUID(uuid);
        }

        // 清除之前的媒体元素
        if (largeMedia) {
            if (largeMedia.src && largeMedia.src.startsWith('blob:')) {
                URL.revokeObjectURL(largeMedia.src);
            }
            largeMedia.remove();
        }

        if (blob) {
            const blobUrl = URL.createObjectURL(blob);

            if (isVideo) {
                // 创建视频元素
                largeMedia = doc.createElement('video');
                largeMedia.src = blobUrl;
                largeMedia.controls = true;
                largeMedia.loop = true;
                largeMedia.muted = true;
                largeMedia.playsInline = true;
                largeMedia.autoplay = true;
                largeMedia.style.maxWidth = '100%';
                largeMedia.style.maxHeight = '60vh';

                // 添加错误处理
                largeMedia.onerror = function () {
                    console.warn('[image_cache] Video cannot be played');
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
                           style="background: rgba(255,255,255,0.2); padding: 12px 24px; border-radius: 4px; color: #fff; text-decoration: none;">
                            📥 下载视频
                        </a>
                    `;
                    fallback.className = 'st-chatu8-preview-large-image';
                    fallback.dataset.uuid = uuid;
                    fallback.dataset.isVideo = 'true';
                    if (imageInfo) {
                        fallback.dataset.source = imageInfo.source;
                        if (imageInfo.path) {
                            fallback.dataset.path = imageInfo.path;
                        }
                    }
                    if (largeMedia.parentNode) {
                        largeMedia.parentNode.replaceChild(fallback, largeMedia);
                        largeMedia = fallback;
                    }
                };
            } else {
                // 创建图片元素
                largeMedia = doc.createElement('img');
                largeMedia.src = blobUrl;
            }

            largeMedia.className = 'st-chatu8-preview-large-image';
            largeMedia.dataset.uuid = uuid;
            largeMedia.dataset.isVideo = isVideo ? 'true' : 'false';
            if (imageInfo) {
                largeMedia.dataset.source = imageInfo.source;
                if (imageInfo.path) {
                    largeMedia.dataset.path = imageInfo.path;
                }
            }

            largeMediaWrapper.appendChild(largeMedia);
        } else {
            const errorMsg = doc.createElement('div');
            errorMsg.textContent = '加载失败';
            largeMediaWrapper.appendChild(errorMsg);
        }
    }

    loadImage(initialUUID);
    updateNavButtons();
}

function displayCachePage(page) {
    const grid = document.getElementById('image-cache-grid');
    if (!grid) return;

    grid.querySelectorAll('img').forEach(img => {
        if (img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
        }
    });

    grid.innerHTML = '';

    const startIndex = (page - 1) * imageCacheItemsPerPage;
    const endIndex = startIndex + imageCacheItemsPerPage;
    const pageItems = allCachedImages.slice(startIndex, endIndex);

    if (imageObserver) {
        imageObserver.disconnect();
    }

    imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const item = entry.target;
                const uuid = item.dataset.uuid;
                const thumbnailUuid = item.dataset.thumbnailUuid;
                const thumbnailPath = item.dataset.thumbnailPath;
                const source = item.dataset.source;
                const img = item.querySelector('img');

                // 根据来源选择加载方式
                let promise;
                if (source === 'server' && thumbnailPath) {
                    // 服务器缩略图：直接从路径加载
                    promise = fetch(thumbnailPath)
                        .then(response => response.ok ? response.blob() : null)
                        .catch(() => null);
                } else if (thumbnailUuid) {
                    // IndexedDB 缩略图：使用 UUID 加载
                    promise = getImageThumbnailBlobByUUID(thumbnailUuid);
                } else {
                    // 没有缩略图，加载原图
                    promise = getImageBlobByUUID(uuid);
                }

                promise.then(blob => {
                    if (blob) {
                        img.src = URL.createObjectURL(blob);
                    } else {
                        img.alt = "加载失败";
                    }
                }).catch(() => {
                    img.alt = "加载失败";
                });
                observer.unobserve(item);
            }
        });
    }, { rootMargin: "200px" });

    pageItems.forEach(imageMeta => {
        const item = document.createElement('div');
        item.className = 'st-chatu8-image-cache-item';
        item.dataset.uuid = imageMeta.uuid;
        item.dataset.md5 = imageMeta.md5;
        item.dataset.source = imageMeta.source; // 添加来源信息
        item.dataset.isVideo = imageMeta.isVideo ? 'true' : 'false'; // 添加视频标识

        // 根据来源设置缩略图信息
        if (imageMeta.thumbnail_uuid) {
            item.dataset.thumbnailUuid = imageMeta.thumbnail_uuid;
        }
        if (imageMeta.thumbnail_path) {
            item.dataset.thumbnailPath = imageMeta.thumbnail_path;
        }

        if (selectedImages.has(imageMeta.uuid)) {
            item.classList.add('selected');
        }

        const img = document.createElement('img');
        img.dataset.src = 'placeholder';

        // 如果是视频，添加视频图标标记
        if (imageMeta.isVideo) {
            const videoIcon = document.createElement('div');
            videoIcon.className = 'st-chatu8-video-icon';
            videoIcon.innerHTML = '<i class="fa-solid fa-video"></i>';
            videoIcon.style.cssText = 'position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.7); color: white; padding: 4px 6px; border-radius: 4px; font-size: 12px;';
            item.style.position = 'relative';
            item.appendChild(videoIcon);
        }

        const info = document.createElement('div');
        info.className = 'st-chatu8-image-info';
        info.textContent = new Date(imageMeta.timestamp).toLocaleString();

        item.appendChild(img);
        item.appendChild(info);
        grid.appendChild(item);

        imageObserver.observe(item);

        item.addEventListener('click', () => {
            if (isMultiSelectMode) {
                if (selectedImages.has(imageMeta.uuid)) {
                    selectedImages.delete(imageMeta.uuid);
                    item.classList.remove('selected');
                } else {
                    selectedImages.add(imageMeta.uuid);
                    item.classList.add('selected');
                }
                updateImageCacheInfo();
            } else {
                showCacheImagePreview(imageMeta.uuid);
            }
        });
    });

    updateImageCachePagination();
}

function updateImageCachePagination() {
    const pagination = document.getElementById('image-cache-pagination');
    const jumpContainer = document.getElementById('image-cache-jump-container');
    const jumpInput = document.getElementById('image-cache-jump-input');

    if (!pagination || !jumpContainer || !jumpInput) return;

    // 清空除了跳转容器之外的所有内容
    Array.from(pagination.childNodes).forEach(child => {
        if (child.id !== 'image-cache-jump-container') {
            pagination.removeChild(child);
        }
    });

    const totalPages = Math.ceil(allCachedImages.length / imageCacheItemsPerPage);

    if (totalPages <= 1) {
        jumpContainer.style.display = 'none';
        return;
    }

    jumpContainer.style.display = 'inline-block'; // 或者 'flex'
    jumpInput.max = totalPages;
    jumpInput.value = imageCacheCurrentPage;

    const prevButton = document.createElement('button');
    prevButton.className = 'st-chatu8-btn';
    prevButton.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
    prevButton.disabled = imageCacheCurrentPage === 1;
    prevButton.addEventListener('click', () => {
        if (imageCacheCurrentPage > 1) {
            imageCacheCurrentPage--;
            displayCachePage(imageCacheCurrentPage);
        }
    });

    const nextButton = document.createElement('button');
    nextButton.className = 'st-chatu8-btn';
    nextButton.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
    nextButton.disabled = imageCacheCurrentPage === totalPages;
    nextButton.addEventListener('click', () => {
        if (imageCacheCurrentPage < totalPages) {
            imageCacheCurrentPage++;
            displayCachePage(imageCacheCurrentPage);
        }
    });

    const pageInfo = document.createElement('span');
    pageInfo.textContent = `第 ${imageCacheCurrentPage} / ${totalPages} 页`;
    pageInfo.style.margin = '0 10px';

    // 将控件插入到跳转容器之前
    pagination.insertBefore(prevButton, jumpContainer);
    pagination.insertBefore(pageInfo, jumpContainer);
    pagination.insertBefore(nextButton, jumpContainer);
}

function updateImageCacheInfo() {
    const info = document.getElementById('image-cache-info');
    if (!info) return;
    const total = allCachedImages.length;
    const selected = selectedImages.size;
    const videoCount = allCachedImages.filter(img => img.isVideo).length;
    const imageCount = total - videoCount;
    info.textContent = `总计 ${total} 个媒体 (图片: ${imageCount}, 视频: ${videoCount}) | 选中 ${selected} 个`;
}

async function loadImageCache() {
    const grid = document.getElementById('image-cache-grid');
    const info = document.getElementById('image-cache-info');
    if (!grid || !info) return;

    grid.innerHTML = '正在加载图片...';
    const metadata = await getAllImageMetadata();

    allCachedImages = [];
    for (const [md5, meta] of Object.entries(metadata)) {
        if (meta.images && Array.isArray(meta.images)) {
            meta.images.forEach(imageEntry => {
                if (imageEntry.date) {
                    // 适应新的双模式存储：保存来源信息和路径
                    const imageData = {
                        uuid: imageEntry.uuid,
                        thumbnail_uuid: imageEntry.thumbnail_uuid,
                        md5: md5,
                        timestamp: imageEntry.date,
                        source: imageEntry.source || 'db', // 'server' 或 'db'
                        path: imageEntry.path || null, // 服务器路径（如果有）
                        thumbnail_path: imageEntry.thumbnail_path || null,
                        isVideo: imageEntry.isVideo || false // 添加视频标识
                    };
                    allCachedImages.push(imageData);
                }
            });
        }
    }

    // 按时间戳降序排序（最新的在前）
    allCachedImages.sort((a, b) => b.timestamp - a.timestamp);

    imageCacheCurrentPage = 1;
    selectedImages.clear();

    if (allCachedImages.length === 0) {
        grid.innerHTML = '没有找到缓存的图片。';
        info.textContent = '总计 0 张图片。';
        updateImageCachePagination();
    } else {
        displayCachePage(imageCacheCurrentPage);
        updateImageCacheInfo();
    }
}

async function clearCache() {
    const settings = extension_settings[extensionName];
    stylishConfirm(`你确定要清除所有过期的图片缓存吗？ (过期时间: ${settings.cache} 天)`).then(async (confirmed) => {
        if (confirmed) {
            try {
                const metadata = await getAllImageMetadata();
                if (!metadata || Object.keys(metadata).length === 0) {
                    alert("图片库为空，无需清理。");
                    return;
                }

                const md5sToDelete = [];
                const now = new Date().getTime();
                const cacheDays = Number(settings.cache);

                for (const [md5, meta] of Object.entries(metadata)) {
                    if (meta && meta.images && meta.images.length > 0) {
                        const latestDate = Math.max(...meta.images.map(img => img.date).filter(Boolean));
                        if (latestDate) {
                            const timeDiff = now - latestDate;
                            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                            if (daysDiff > cacheDays) {
                                md5sToDelete.push(md5);
                            }
                        }
                    }
                }

                if (md5sToDelete.length > 0) {
                    await deleteMultipleImages(md5sToDelete);
                    alert(`清除了 ${md5sToDelete.length} 个过期图片条目。`);

                    // 清除缓存后同步服务器图片
                    if (settings.jiuguanchucun === "true") {
                        console.log('[Cache] 正在同步服务器图片...');
                        const syncResult = await syncServerImagesWithStorage();
                        if (syncResult.deletedCount > 0) {
                            console.log(`[Cache] 同步完成，删除了 ${syncResult.deletedCount} 个不同步的服务器图片`);
                        }
                        if (syncResult.errors.length > 0) {
                            console.warn('[Cache] 同步过程中出现错误:', syncResult.errors);
                        }
                    }

                    await loadImageCache();
                } else {
                    alert("没有找到过期的图片缓存。");
                }
            } catch (error) {
                console.error("清除缓存失败:", error);
                alert("清除缓存时发生错误，请查看控制台。");
            }
        }
    });
}

export function initImageCache(settingsModal) {
    settingsModal.find('a[data-tab="image-cache"]').on('click', loadImageCache);
    settingsModal.find('#Clear-Cache').on('click', clearCache);

    const jumpInput = document.getElementById('image-cache-jump-input');
    const jumpButton = document.getElementById('image-cache-jump-button');

    if (jumpInput && jumpButton) {
        const handleJump = () => {
            const totalPages = Math.ceil(allCachedImages.length / imageCacheItemsPerPage);
            const targetPage = parseInt(jumpInput.value);
            if (targetPage >= 1 && targetPage <= totalPages && targetPage !== imageCacheCurrentPage) {
                imageCacheCurrentPage = targetPage;
                displayCachePage(imageCacheCurrentPage);
            }
        };

        jumpButton.addEventListener('click', handleJump);
        jumpInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleJump();
            }
        });

        jumpInput.addEventListener('input', () => {
            const totalPages = Math.ceil(allCachedImages.length / imageCacheItemsPerPage);
            const value = parseInt(jumpInput.value);
            if (value < 1) {
                jumpInput.value = 1;
            } else if (value > totalPages) {
                jumpInput.value = totalPages;
            }
        });
    }

    $('#image-cache-toggle-multiselect').on('click', function () {
        isMultiSelectMode = !isMultiSelectMode;
        const grid = document.getElementById('image-cache-grid');
        const button = $(this);

        if (isMultiSelectMode) {
            button.text('取消多选');
            button.addClass('active');
            grid.classList.add('multi-select-mode');
        } else {
            button.text('多选');
            button.removeClass('active');
            grid.classList.remove('multi-select-mode');
            selectedImages.clear();
            grid.querySelectorAll('.st-chatu8-image-cache-item.selected').forEach(item => item.classList.remove('selected'));
            updateImageCacheInfo();
        }
    });

    $('#image-cache-select-all').on('click', () => {
        const grid = document.getElementById('image-cache-grid');
        grid.querySelectorAll('.st-chatu8-image-cache-item').forEach(item => {
            selectedImages.add(item.dataset.uuid);
            item.classList.add('selected');
        });
        updateImageCacheInfo();
    });

    $('#image-cache-deselect-all').on('click', () => {
        const grid = document.getElementById('image-cache-grid');
        selectedImages.clear();
        grid.querySelectorAll('.st-chatu8-image-cache-item').forEach(item => item.classList.remove('selected'));
        updateImageCacheInfo();
    });

    $('#image-cache-delete-selected').on('click', async () => {
        if (selectedImages.size === 0) {
            alert('请先选择要删除的图片。');
            return;
        }
        const confirmed = await stylishConfirm(`确定要删除选中的 ${selectedImages.size} 张图片吗？此操作不可撤销。`);
        if (confirmed) {
            await deleteImagesByUuids(Array.from(selectedImages));
            alert('选中的图片已删除。');
            loadImageCache();
        }
    });

    $('#image-cache-download-selected').on('click', async () => {
        if (selectedImages.size === 0) {
            alert('请先选择要下载的媒体。');
            return;
        }

        const totalCount = selectedImages.size;
        const batchSize = 10; // 每批处理的数量，避免内存溢出
        const uuids = Array.from(selectedImages);
        const zip = new JSZip();
        let successCount = 0;
        let failCount = 0;

        toastr.info(`正在准备下载 ${totalCount} 个媒体文件...`);

        // 分批处理
        for (let i = 0; i < uuids.length; i += batchSize) {
            const batch = uuids.slice(i, i + batchSize);

            const batchPromises = batch.map(async (uuid) => {
                try {
                    // 查找该 uuid 对应的媒体信息
                    const mediaInfo = allCachedImages.find(img => img.uuid === uuid);
                    const isVideo = mediaInfo?.isVideo || false;
                    const ext = isVideo ? 'mp4' : 'png';

                    let blob;
                    if (mediaInfo?.source === 'server' && mediaInfo?.path) {
                        // 从服务器获取
                        const response = await fetch(mediaInfo.path);
                        if (response.ok) {
                            blob = await response.blob();
                        }
                    } else {
                        // 从 IndexedDB 获取
                        blob = await getImageBlobByUUID(uuid);
                    }

                    if (blob && blob.size > 0) {
                        zip.file(`${uuid}.${ext}`, blob);
                        successCount++;
                    } else {
                        failCount++;
                        console.warn(`无法获取媒体: ${uuid}`);
                    }
                } catch (error) {
                    failCount++;
                    console.error(`下载媒体失败 ${uuid}:`, error);
                }
            });

            await Promise.all(batchPromises);

            // 更新进度
            const processed = Math.min(i + batchSize, uuids.length);
            if (processed < uuids.length) {
                toastr.info(`处理进度: ${processed}/${totalCount}`, '', { timeOut: 1000 });
            }
        }

        // 检查是否有成功添加的文件
        if (successCount === 0) {
            toastr.error('没有成功获取任何媒体文件，下载已取消。');
            return;
        }

        if (failCount > 0) {
            toastr.warning(`${failCount} 个文件获取失败，将下载 ${successCount} 个成功的文件。`);
        }

        toastr.info('正在生成压缩包...');

        try {
            const content = await zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: { level: 6 }
            });

            if (content.size === 0) {
                toastr.error('生成的压缩包为空，请重试。');
                return;
            }

            const url = URL.createObjectURL(content);
            const a = document.createElement("a");
            a.href = url;
            a.download = `st-chatu8-media-${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toastr.success(`成功下载 ${successCount} 个媒体文件！`);
        } catch (error) {
            console.error('生成压缩包失败:', error);
            toastr.error('生成压缩包失败，可能文件过大。请尝试减少选择的数量。');
        }
    });
}
