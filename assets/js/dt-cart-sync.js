/**
 * DT Brand's — Global Cart, Wishlist & Buy Now Real-Time Sync Engine
 * Zero-refresh synchronization across product cards, drawers, standalone pages,
 * checkout modal, multi-tabs, and backend APIs (/api/cart.php & /api/wishlist.php).
 */
(function() {
    'use strict';

    var CART_KEY = 'dtbrands_cart';
    var WISH_KEY = 'dtbrands_wishlist';
    var _cartSyncTimer = null;

    function getCsrfToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        return (meta && meta.getAttribute('content')) || window.DT_CSRF_TOKEN || '';
    }

    function parsePriceNum(val) {
        if (typeof val === 'number') return isFinite(val) ? val : 0;
        var num = parseFloat(String(val || '0').replace(/[^0-9.]/g, ''));
        return isFinite(num) ? num : 0;
    }

    function readJsonList(key) {
        try {
            var parsed = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function writeJsonList(key, list) {
        try {
            localStorage.setItem(key, JSON.stringify(list));
        } catch (e) {}
    }

    // ── Toast Notification ──────────────────────────────────────────────────
    function dtToast(msg, type) {
        var tc = document.getElementById('toastContainer');
        if (!tc) {
            tc = document.createElement('div');
            tc.id = 'toastContainer';
            tc.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(tc);
        }
        var t = document.createElement('div');
        var color = type === 'wish' ? '#15803D' : type === 'remove' ? '#DC2626' : '#B8860B';
        t.style.cssText = 'background:#111827;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;font-family:Inter,sans-serif;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,0.35);border-left:3px solid ' + color + ';opacity:0;transform:translateY(10px);transition:all 0.25s ease;min-width:200px;pointer-events:none;';
        t.innerHTML = msg;
        tc.appendChild(t);
        requestAnimationFrame(function() {
            t.style.opacity = '1';
            t.style.transform = 'translateY(0)';
        });
        setTimeout(function() {
            t.style.opacity = '0';
            t.style.transform = 'translateY(10px)';
            setTimeout(function() { t.remove(); }, 300);
        }, 2800);
    }

    // ── Helper: find product by id across all loaded catalogs ───────────────
    function findProduct(id) {
        if (typeof id === 'object' && id !== null) return id;
        var numId = parseInt(id, 10);
        var sources = [
            window.currentProductData ? [window.currentProductData] : [],
            window.shopProductsData || [],
            window.allProducts || [],
            window.catalogProducts || [],
            window.products || [],
            readJsonList(WISH_KEY),
            readJsonList(CART_KEY)
        ];
        for (var s = 0; s < sources.length; s++) {
            var arr = sources[s];
            if (!Array.isArray(arr)) continue;
            for (var i = 0; i < arr.length; i++) {
                if (arr[i] && parseInt(arr[i].id || arr[i].product_id, 10) === numId) {
                    return arr[i];
                }
            }
        }
        return null;
    }

    function syncHeartButtons(wishItems) {
        var wishMap = {};
        (wishItems || []).forEach(function(item) {
            if (item && (item.id || item.product_id)) {
                wishMap[String(parseInt(item.id || item.product_id, 10))] = true;
            }
        });

        document.querySelectorAll('.card-wishlist-btn, .wish-btn, .wd-card-wish-btn, .rec-wishlist-btn, .deal-card-wish-btn, [data-action="wishlist"]').forEach(function(btn) {
            var id = btn.dataset.id || btn.dataset.productId || (btn.closest('[data-id]') && btn.closest('[data-id]').dataset.id);
            if (!id) return;
            var active = !!wishMap[String(parseInt(id, 10))];
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            var path = btn.querySelector('svg path');
            if (path) {
                path.setAttribute('fill', active ? '#DC2626' : 'none');
                path.setAttribute('stroke', active ? '#DC2626' : 'currentColor');
            }
        });

        if (typeof window.syncPdpWishlistButton === 'function') {
            window.syncPdpWishlistButton();
        }
        if (typeof window.syncPdpHeaderState === 'function') {
            window.syncPdpHeaderState();
        }
    }

    // ── Live Zero-Refresh UI & Badge Sync ───────────────────────────────────
    var _isSyncingBadges = false;
    function dtSyncBadges(source) {
        if (_isSyncingBadges) return;
        _isSyncingBadges = true;
        try {
            var cartItems = readJsonList(CART_KEY);
            var wishItems = readJsonList(WISH_KEY);
            var cartQty = cartItems.reduce(function(s, x) { return s + (parseInt(x.qty || x.quantity, 10) || 1); }, 0);
            var wishQty = wishItems.length;

            window.cartState = cartItems;
            window.wishlistState = wishItems;

            // Update all cart badges across header, mobile nav, PDP & account tiles
            ['cartBadge', 'headerCartBadge', 'pdpCartCount', 'mobileCartBadge', 'wsCartBadge', 'dockCartBadge', 'homeDrawerCartBadge'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) {
                    el.textContent = cartQty;
                    el.style.display = cartQty > 0 ? 'flex' : 'none';
                }
            });

            // Update all wishlist badges across header, mobile nav, PDP & account tiles
            ['wishlistBadge', 'smartWishlistBadge', 'shopSmartWishlistBadge', 'pdpWishlistCount', 'mobileWishBadge', 'wsWishlistBadge', 'homeDrawerWishlistBadge'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) {
                    el.textContent = wishQty;
                    el.style.display = wishQty > 0 ? 'flex' : 'none';
                }
            });

            var cSub = document.getElementById('cartBadgeSub');
            if (cSub) cSub.textContent = cartQty + ' Luxury Item' + (cartQty === 1 ? '' : 's');
            var wSub = document.getElementById('wishlistBadgeSub');
            if (wSub) wSub.textContent = wishQty + ' Saved Item' + (wishQty === 1 ? '' : 's');
            var moreCartLabel = document.getElementById('moreCartLabel');
            if (moreCartLabel) moreCartLabel.textContent = 'My Cart (' + cartQty + ' Item' + (cartQty === 1 ? '' : 's') + ')';
            var moreWishLabel = document.getElementById('moreWishlistLabel');
            if (moreWishLabel) moreWishLabel.textContent = 'My Wishlist (' + wishQty + ' Item' + (wishQty === 1 ? '' : 's') + ')';
            var coCount = document.getElementById('coItemCount');
            if (coCount) coCount.textContent = cartQty;

            syncHeartButtons(wishItems);

            var cartBackdrop = document.getElementById('cartDrawerModal');
            if (source !== 'cart_render' && source !== 'wish_render' && typeof window.renderCart === 'function') {
                if (cartItems.length > 0 || (cartBackdrop && cartBackdrop.classList.contains('active'))) {
                    window.renderCart();
                }
            }
            var wishBackdrop = document.getElementById('wishlistDrawerModal');
            if (source !== 'wish_render' && source !== 'cart_render' && typeof window.renderWishlist === 'function') {
                if (wishItems.length > 0 || (wishBackdrop && wishBackdrop.classList.contains('active'))) {
                    window.renderWishlist();
                }
            }
            if (source !== 'cart_page' && typeof window.renderCartPage === 'function') {
                window.renderCartPage();
            }
            if (source !== 'wish_page' && typeof window.renderWishlistPage === 'function') {
                window.renderWishlistPage();
            }
            if (source !== 'checkout_render' && typeof window.renderCheckoutItems === 'function') {
                var coBackdrop = document.getElementById('checkoutBackdrop');
                if (coBackdrop && (coBackdrop.classList.contains('active') || window.location.pathname.indexOf('checkout') !== -1)) {
                    window.renderCheckoutItems();
                }
            }

            if (source !== 'event' && source !== 'cart_render' && source !== 'wish_render') {
                window.dispatchEvent(new CustomEvent('dt:cart-updated', { detail: { items: cartItems, count: cartQty } }));
                window.dispatchEvent(new CustomEvent('dt:wishlist-updated', { detail: { items: wishItems, count: wishQty } }));
            }
        } catch (e) {} finally {
            _isSyncingBadges = false;
        }
    }

    function mapServerCartItem(srv) {
        return {
            id: parseInt(srv.product_id || srv.id, 10),
            product_id: parseInt(srv.product_id || srv.id, 10),
            variant_id: srv.variant_id ? parseInt(srv.variant_id, 10) : null,
            product_type: srv.product_type || 'single_piece',
            selling_type: srv.selling_type || 'single_piece',
            sku: srv.sku || '',
            name: srv.name || srv.title || 'Ethnic Wear',
            price: Number(srv.unit_price || srv.price || 0),
            old_price: srv.old_price ? Number(srv.old_price) : null,
            image: srv.image || '/assets/images/no-image.svg',
            size: srv.size || '',
            color: srv.color || '',
            qty: Math.max(1, parseInt(srv.qty || srv.quantity || 1, 10) || 1),
            mcq: Math.max(1, parseInt(srv.mcq || 1, 10) || 1)
        };
    }

    function syncCartWithServer(cartItems) {
        clearTimeout(_cartSyncTimer);
        _cartSyncTimer = setTimeout(function() {
            var csrfTok = getCsrfToken();
            var payloadItems = (cartItems || []).map(function(x) {
                return {
                    id: parseInt(x.product_id || x.id, 10),
                    variant_id: x.variant_id ? parseInt(x.variant_id, 10) : null,
                    qty: parseInt(x.qty || x.quantity, 10) || 1,
                    size: x.size || '',
                    color: x.color || '',
                    lot_type: (x.selling_type === 'full_set' || x.product_type === 'full_set') ? 'full_set' : 'single'
                };
            }).filter(function(x) { return x.id > 0; });

            fetch('/api/cart.php', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTok },
                body: JSON.stringify({ action: 'sync', items: payloadItems, csrf_token: csrfTok })
            })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (!res || typeof res !== 'object') return;
                window.DT_CART_SERVER_VALIDATION = res;
                if (payloadItems.length === 0) {
                    return;
                }
                if (res.success && Array.isArray(res.items) && res.items.length > 0) {
                    var current = readJsonList(CART_KEY);
                    var changed = false;
                    res.items.forEach(function(srv) {
                        var match = current.find(function(loc) {
                            return parseInt(loc.product_id || loc.id, 10) === parseInt(srv.product_id || srv.id, 10) &&
                                String(loc.size || '') === String(srv.size || '') &&
                                String(loc.color || '') === String(srv.color || '');
                        });
                        if (match && Number(srv.unit_price) > 0 && Number(match.price) !== Number(srv.unit_price)) {
                            match.price = Number(srv.unit_price);
                            changed = true;
                        }
                    });
                    if (changed) {
                        writeJsonList(CART_KEY, current);
                        dtSyncBadges();
                    }
                }
            })
            .catch(function() {});
        }, 120);
    }

    function syncWishlistWithServer(action, productId, variantId) {
        var csrfTok = getCsrfToken();
        fetch('/api/wishlist.php', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTok },
            body: JSON.stringify({
                action: action,
                product_id: parseInt(productId, 10),
                variant_id: variantId ? parseInt(variantId, 10) : null,
                csrf_token: csrfTok
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res && res.success && Array.isArray(res.items) && window.DT_CURRENT_USER && window.DT_CURRENT_USER.id) {
                // Keep authoritative DB items mirrored locally
                var mapped = res.items.map(normalizeWishItem);
                writeJsonList(WISH_KEY, mapped);
                dtSyncBadges('event');
            }
        })
        .catch(function() {});
    }

    function normalizeWishItem(p, fallbackId) {
        var id = parseInt((p && (p.product_id || p.id)) || fallbackId, 10);
        return {
            id: id,
            product_id: id,
            name: (p && (p.name || p.title)) || ('Product #' + id),
            price: parsePriceNum((p && (p.price || p.effective_price || p.effective_customer_price || p.selling_price || p.retail_price)) || 0),
            old_price: parsePriceNum((p && (p.old_price || p.base_price || p.mrp)) || 0),
            image: (p && (p.image || p.img || p.thumbnail || (Array.isArray(p.images) && p.images[0]))) || '/assets/images/no-image.svg',
            category: (p && p.category) || '',
            fabric: (p && p.fabric) || '',
            color: (p && (p.color || (Array.isArray(p.colors) && p.colors[0]))) || '',
            in_stock: (p && typeof p.in_stock === 'boolean') ? p.in_stock : undefined
        };
    }

    // ── Normalize flexible Add-To-Cart arguments across every caller ────────
    function normalizeAddArgs(productIdOrObj, arg2, arg3, arg4) {
        var opts = { qty: 1, size: '', color: '', variant_id: null, mcq: 1, openDrawer: true };
        var p = findProduct(productIdOrObj);
        if (!p && typeof productIdOrObj !== 'object') {
            p = { id: parseInt(productIdOrObj, 10), name: 'Product #' + productIdOrObj, price: 0, image: '/assets/images/no-image.svg' };
        }
        if (typeof productIdOrObj === 'object' && productIdOrObj !== null) {
            p = Object.assign({}, findProduct(productIdOrObj.id || productIdOrObj.product_id) || {}, productIdOrObj);
            if (p.qty) opts.qty = parseInt(p.qty, 10) || 1;
            if (p.size) opts.size = Array.isArray(p.size) ? (p.size[0] || '') : String(p.size);
            if (p.color) opts.color = String(p.color);
            if (p.variant_id) opts.variant_id = parseInt(p.variant_id, 10);
            if (p.mcq) opts.mcq = Math.max(1, parseInt(p.mcq, 10) || 1);
        }

        if (typeof arg2 === 'object' && arg2 !== null) {
            if (arg2.qty || arg2.quantity) opts.qty = parseInt(arg2.qty || arg2.quantity, 10) || opts.qty;
            if (arg2.size !== undefined) opts.size = String(arg2.size || '');
            if (arg2.color !== undefined) opts.color = String(arg2.color || '');
            if (arg2.variant_id) opts.variant_id = parseInt(arg2.variant_id, 10);
            if (arg2.mcq) opts.mcq = Math.max(1, parseInt(arg2.mcq, 10) || 1);
            if (typeof arg2.openDrawer === 'boolean') opts.openDrawer = arg2.openDrawer;
        } else if (typeof arg2 === 'number' || (typeof arg2 === 'string' && /^\d+$/.test(arg2.trim()))) {
            opts.qty = Math.max(1, parseInt(arg2, 10) || 1);
            if (typeof arg3 === 'object' && arg3 !== null) {
                if (arg3.size !== undefined) opts.size = String(arg3.size || '');
                if (arg3.color !== undefined) opts.color = String(arg3.color || '');
                if (arg3.variant_id) opts.variant_id = parseInt(arg3.variant_id, 10);
                if (arg3.mcq) opts.mcq = Math.max(1, parseInt(arg3.mcq, 10) || 1);
                if (typeof arg3.openDrawer === 'boolean') opts.openDrawer = arg3.openDrawer;
            } else {
                if (arg3) opts.size = String(arg3);
                if (arg4) opts.color = String(arg4);
            }
        } else {
            // Legacy Shared/cart.php signature: (product, size, color, qty)
            if (arg2) opts.size = String(arg2);
            if (arg3) opts.color = String(arg3);
            if (arg4 && typeof arg4 === 'object') {
                if (arg4.qty) opts.qty = Math.max(1, parseInt(arg4.qty, 10) || 1);
                if (typeof arg4.openDrawer === 'boolean') opts.openDrawer = arg4.openDrawer;
            } else if (arg4) {
                opts.qty = Math.max(1, parseInt(arg4, 10) || 1);
            }
        }

        if (!opts.size && p) {
            opts.size = Array.isArray(p.size) ? (p.size[0] || '') : (Array.isArray(p.sizes) ? (p.sizes[0] || '') : (p.size || ''));
        }
        if (!opts.color && p) {
            opts.color = Array.isArray(p.colors) ? (p.colors[0] || '') : (p.color || '');
        }
        return { p: p, opts: opts };
    }

    // ── GLOBAL: dtAddToCart ─────────────────────────────────────────────────
    window.dtAddToCart = function(productIdOrObj, arg2, arg3, arg4) {
        var resolved = normalizeAddArgs(productIdOrObj, arg2, arg3, arg4);
        var p = resolved.p;
        var opts = resolved.opts;
        if (!p || !parseInt(p.product_id || p.id, 10)) return false;

        var pProdId = parseInt(p.product_id || p.id, 10);
        var pVariantId = opts.variant_id || (p.variant_id ? parseInt(p.variant_id, 10) : null);
        var pType = p.product_type || (p.selling_type === 'full_set' || p.selling_type === 'set' ? 'full_set' : 'single_piece');
        var pSellingType = p.selling_type || (pType === 'full_set' ? 'full_set' : 'single_piece');
        var itemMcq = Math.max(1, parseInt(opts.mcq || p.mcq || p.wholesaler_mcq || 1, 10) || 1);

        var unitPrice = parsePriceNum(
            p.price || p.effective_price || p.effective_customer_price || p.effective_retail_price ||
            p.effective_wholesale_price || p.effective_reseller_price || p.selling_price || 0
        );
        if (unitPrice <= 0 && (p.retail_price || p.mrp)) {
            unitPrice = Math.max(0, parsePriceNum(p.retail_price || p.mrp) - parsePriceNum(p.sale_discount || p.sale_price || 0));
        }

        var cart = readJsonList(CART_KEY);
        var idx = cart.findIndex(function(x) {
            if (pVariantId && x.variant_id) {
                return parseInt(x.variant_id, 10) === pVariantId;
            }
            return parseInt(x.product_id || x.id, 10) === pProdId &&
                String(x.size || '') === String(opts.size || '') &&
                String(x.color || '') === String(opts.color || '');
        });

        if (idx >= 0) {
            cart[idx].qty = (parseInt(cart[idx].qty || cart[idx].quantity, 10) || 1) + opts.qty;
            if (pVariantId && !cart[idx].variant_id) cart[idx].variant_id = pVariantId;
            if (p.sku && !cart[idx].sku) cart[idx].sku = p.sku;
            if (unitPrice > 0) cart[idx].price = unitPrice;
            cart[idx].mcq = Math.max(itemMcq, parseInt(cart[idx].mcq || 1, 10) || 1);
        } else {
            cart.push({
                id: pProdId,
                product_id: pProdId,
                variant_id: pVariantId,
                product_type: pType,
                selling_type: pSellingType,
                sku: p.sku || '',
                name: p.name || p.title || 'Ethnic Wear',
                price: unitPrice,
                old_price: parsePriceNum(p.old_price || p.mrp || 0) || null,
                image: p.image || p.img || p.thumbnail || (Array.isArray(p.images) && p.images[0]) || '/assets/images/no-image.svg',
                size: opts.size || '',
                color: opts.color || '',
                qty: opts.qty,
                mcq: itemMcq
            });
        }

        writeJsonList(CART_KEY, cart);
        dtSyncBadges();
        syncCartWithServer(cart);

        if (opts.openDrawer !== false) {
            dtToast('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2.5" style="flex-shrink:0"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> <span>Added to Bag!</span>', 'cart');
            if (typeof window.openCartDrawer === 'function') window.openCartDrawer();
        }

        var btn = document.querySelector('.card-add-cart-btn[data-id="' + pProdId + '"]');
        if (btn) {
            btn.classList.add('added');
            btn.style.background = 'linear-gradient(135deg,#15803D 0%,#16A34A 100%)';
            btn.style.borderColor = '#15803D';
            setTimeout(function() {
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.classList.remove('added');
            }, 1400);
        }
        return true;
    };

    // ── GLOBAL: dtBuyNow (Add without flashing cart drawer -> Direct Checkout)
    window.dtBuyNow = function(productIdOrObj, opts) {
        var buyOpts = Object.assign({}, opts || {}, { openDrawer: false });
        var ok = window.dtAddToCart(productIdOrObj, buyOpts);
        if (!ok) return false;

        if (typeof window.closeCartDrawer === 'function') window.closeCartDrawer();
        if (typeof window.closeWishlistDrawer === 'function') window.closeWishlistDrawer();
        if (typeof window.closeQV === 'function') window.closeQV();

        setTimeout(function() {
            if (typeof window.openCheckout === 'function') {
                window.openCheckout();
            } else if (typeof window.openCheckoutModal === 'function') {
                window.openCheckoutModal();
            } else {
                var id = parseInt((typeof productIdOrObj === 'object' ? (productIdOrObj.id || productIdOrObj.product_id) : productIdOrObj), 10) || '';
                window.location.href = '/checkout.php' + (id ? ('?buy_id=' + id + '&qty=' + (buyOpts.qty || 1)) : '');
            }
        }, 60);
        return true;
    };

    // ── GLOBAL: dtToggleWishlist ────────────────────────────────────────────
    window.dtToggleWishlist = function(productIdOrObj, opt) {
        var p = findProduct(productIdOrObj);
        var id = parseInt((p && (p.id || p.product_id)) || productIdOrObj, 10);
        if (!id) return false;
        if (!p) p = { id: id, name: 'Product #' + id, price: 0, image: '/assets/images/no-image.svg' };

        var list = readJsonList(WISH_KEY);
        var idx = list.findIndex(function(x) { return parseInt(x.id || x.product_id, 10) === id; });
        var added;
        if (idx >= 0) {
            list.splice(idx, 1);
            added = false;
        } else {
            list.push(normalizeWishItem(p, id));
            added = true;
        }
        writeJsonList(WISH_KEY, list);

        dtToast(added
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#15803D" stroke="#15803D" stroke-width="1.5" style="flex-shrink:0"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> <span>Saved to Wishlist!</span>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" style="flex-shrink:0"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> <span>Removed from Wishlist</span>',
            added ? 'wish' : 'remove'
        );

        dtSyncBadges();
        syncWishlistWithServer('toggle', id, p.variant_id || null);

        if (opt && opt.openDrawer === true && typeof window.openWishlistDrawer === 'function') {
            setTimeout(function() { window.openWishlistDrawer(); }, 120);
        }
        return added;
    };

    // ── Wire product cards cleanly without duplicating inline onclick ───────
    function wireProductCards() {
        document.querySelectorAll('.card-add-cart-btn, .btn-add-cart, [data-action="add-cart"]').forEach(function(btn) {
            if (btn.dataset.dtWired || btn.hasAttribute('onclick')) {
                btn.dataset.dtWired = '1';
                return;
            }
            btn.dataset.dtWired = '1';
            var id = btn.dataset.id || btn.dataset.productId || (btn.closest('[data-id]') && btn.closest('[data-id]').dataset.id);
            if (!id) return;
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.dtAddToCart(id);
            });
        });

        document.querySelectorAll('.card-wishlist-btn, .btn-wishlist, .deal-card-wish-btn, [data-action="wishlist"]').forEach(function(btn) {
            if (btn.dataset.dtWired || btn.hasAttribute('onclick')) {
                btn.dataset.dtWired = '1';
                return;
            }
            btn.dataset.dtWired = '1';
            var id = btn.dataset.id || btn.dataset.productId || (btn.closest('[data-id]') && btn.closest('[data-id]').dataset.id);
            if (!id) return;
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.dtToggleWishlist(id);
            });
        });

        syncHeartButtons(readJsonList(WISH_KEY));
    }

    // ── Unified Public Bridges ──────────────────────────────────────────────
    window.addToCart = function(productOrId, sizeOrOpts, color, qty) {
        return window.dtAddToCart(productOrId, sizeOrOpts, color, qty);
    };

    window.directAddToCart = function(productOrId, sizeOrOpts, color, qty) {
        return window.dtAddToCart(productOrId, sizeOrOpts, color, qty);
    };

    window.toggleWishlistProduct = function(productOrId) {
        return window.dtToggleWishlist(productOrId);
    };

    window.dtRemoveWishlistItem = function(id) {
        var pid = parseInt(id, 10);
        var list = readJsonList(WISH_KEY).filter(function(x) { return parseInt(x.id || x.product_id, 10) !== pid; });
        writeJsonList(WISH_KEY, list);
        dtSyncBadges();
        syncWishlistWithServer('remove', pid, null);
    };

    window.dtMoveWishlistToCart = function(id) {
        var pid = parseInt(id, 10);
        var list = readJsonList(WISH_KEY);
        var idx = list.findIndex(function(x) { return parseInt(x.id || x.product_id, 10) === pid; });
        var item = idx >= 0 ? list.splice(idx, 1)[0] : findProduct(pid);
        writeJsonList(WISH_KEY, list);
        if (item) {
            window.dtAddToCart(item, { qty: 1, openDrawer: true });
        }
        dtSyncBadges();
        syncWishlistWithServer('remove', pid, null);
    };

    window.dtSyncCartServer = function() {
        syncCartWithServer(readJsonList(CART_KEY));
    };

    function hydrateFromServer() {
        // Hydrate user-wise SQL cart across guest/customer/reseller/retailer/wholesale roles
        fetch('/api/cart.php?action=view', { credentials: 'same-origin' })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (!res || typeof res !== 'object') return;
                window.DT_CART_SERVER_VALIDATION = res;
                var localItems = readJsonList(CART_KEY);
                if (Array.isArray(res.items) && res.items.length > 0) {
                    var mappedCart = res.items.map(mapServerCartItem);
                    writeJsonList(CART_KEY, mappedCart);
                    dtSyncBadges();
                } else if (localItems.length > 0) {
                    // First-time bridge: push pre-existing local bag into SQL cart_items for role pricing
                    syncCartWithServer(localItems);
                }
            })
            .catch(function() {});

        // Sync wishlist with DB for logged-in members seamlessly on page load
        if (window.DT_CURRENT_USER && window.DT_CURRENT_USER.id) {
            fetch('/api/wishlist.php?action=view', { credentials: 'same-origin' })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res && res.success && Array.isArray(res.items) && res.items.length > 0) {
                        var mapped = res.items.map(normalizeWishItem);
                        writeJsonList(WISH_KEY, mapped);
                        dtSyncBadges();
                    }
                })
                .catch(function() {});
        }
    }

    // ── Global Styled Confirm & Prompt Modals (replaces raw browser confirm/prompt) ──
    function ensureDialogStyles() {
        if (document.getElementById('dtDialogModalStyles')) return;
        var st = document.createElement('style');
        st.id = 'dtDialogModalStyles';
        st.textContent = '.dt-dlg-backdrop{position:fixed;inset:0;background:rgba(17,24,39,0.62);backdrop-filter:blur(3px);z-index:100020;display:flex;align-items:center;justify-content:center;padding:16px;}' +
            '.dt-dlg-card{width:100%;max-width:410px;background:#fff;border-radius:14px;border:1.5px solid #D4AF37;box-shadow:0 24px 50px rgba(0,0,0,0.32);overflow:hidden;font-family:Inter,Plus Jakarta Sans,sans-serif;}' +
            '.dt-dlg-head{padding:14px 18px;background:linear-gradient(135deg,#181512,#2C241B);color:#D4AF37;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:space-between;}' +
            '.dt-dlg-body{padding:18px;color:#1F2937;font-size:13.5px;line-height:1.5;}' +
            '.dt-dlg-input{width:100%;box-sizing:border-box;margin-top:10px;padding:10px 12px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:13.5px;color:#111827;}' +
            '.dt-dlg-foot{padding:12px 18px 16px;display:flex;justify-content:flex-end;gap:10px;background:#F9FAFB;border-top:1px solid #E5E7EB;}' +
            '.dt-dlg-btn{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid transparent;}' +
            '.dt-dlg-cancel{background:#fff;border-color:#D1D5DB;color:#374151;}' +
            '.dt-dlg-ok{background:linear-gradient(135deg,#B8860B,#D4AF37);color:#111827;border-color:#8A681F;}';
        document.head.appendChild(st);
    }

    window.dtShowConfirmModal = function(message, onConfirm, opts) {
        opts = opts || {};
        ensureDialogStyles();
        var backdrop = document.createElement('div');
        backdrop.className = 'dt-dlg-backdrop';
        var title = opts.title || 'Please Confirm';
        var okLabel = opts.okText || 'Confirm';
        backdrop.innerHTML =
            '<div class="dt-dlg-card" role="dialog" aria-modal="true">' +
                '<div class="dt-dlg-head"><span></span><button type="button" aria-label="Close" style="background:none;border:none;color:#FAF5E8;font-size:18px;cursor:pointer;line-height:1;">&times;</button></div>' +
                '<div class="dt-dlg-body"></div>' +
                '<div class="dt-dlg-foot">' +
                    '<button type="button" class="dt-dlg-btn dt-dlg-cancel">Cancel</button>' +
                    '<button type="button" class="dt-dlg-btn dt-dlg-ok"></button>' +
                '</div>' +
            '</div>';
        backdrop.querySelector('.dt-dlg-head span').textContent = title;
        backdrop.querySelector('.dt-dlg-body').textContent = message;
        backdrop.querySelector('.dt-dlg-ok').textContent = okLabel;
        function closeDlg() { backdrop.remove(); }
        backdrop.querySelector('.dt-dlg-head button').addEventListener('click', closeDlg);
        backdrop.querySelector('.dt-dlg-cancel').addEventListener('click', closeDlg);
        backdrop.querySelector('.dt-dlg-ok').addEventListener('click', function() {
            closeDlg();
            if (typeof onConfirm === 'function') onConfirm();
        });
        backdrop.addEventListener('click', function(e) { if (e.target === backdrop) closeDlg(); });
        document.body.appendChild(backdrop);
        backdrop.querySelector('.dt-dlg-ok').focus();
    };

    window.dtShowPromptModal = function(message, defaultValue, onSubmit, opts) {
        opts = opts || {};
        ensureDialogStyles();
        var backdrop = document.createElement('div');
        backdrop.className = 'dt-dlg-backdrop';
        backdrop.innerHTML =
            '<div class="dt-dlg-card" role="dialog" aria-modal="true">' +
                '<div class="dt-dlg-head"><span></span><button type="button" aria-label="Close" style="background:none;border:none;color:#FAF5E8;font-size:18px;cursor:pointer;line-height:1;">&times;</button></div>' +
                '<div class="dt-dlg-body"><div class="dt-dlg-msg"></div><input type="text" class="dt-dlg-input"></div>' +
                '<div class="dt-dlg-foot">' +
                    '<button type="button" class="dt-dlg-btn dt-dlg-cancel">Cancel</button>' +
                    '<button type="button" class="dt-dlg-btn dt-dlg-ok">Submit</button>' +
                '</div>' +
            '</div>';
        backdrop.querySelector('.dt-dlg-head span').textContent = opts.title || 'Enter Value';
        backdrop.querySelector('.dt-dlg-msg').textContent = message;
        var input = backdrop.querySelector('.dt-dlg-input');
        input.value = defaultValue || '';
        function closeDlg() { backdrop.remove(); }
        backdrop.querySelector('.dt-dlg-head button').addEventListener('click', closeDlg);
        backdrop.querySelector('.dt-dlg-cancel').addEventListener('click', closeDlg);
        backdrop.querySelector('.dt-dlg-ok').addEventListener('click', function() {
            var val = input.value.trim();
            closeDlg();
            if (val && typeof onSubmit === 'function') onSubmit(val);
        });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') backdrop.querySelector('.dt-dlg-ok').click();
            if (e.key === 'Escape') closeDlg();
        });
        backdrop.addEventListener('click', function(e) { if (e.target === backdrop) closeDlg(); });
        document.body.appendChild(backdrop);
        input.focus();
        input.select();
    };

    function init() {
        dtSyncBadges();
        wireProductCards();
        hydrateFromServer();

        if (typeof MutationObserver !== 'undefined' && document.body) {
            var _wireRaf = 0;
            var obs = new MutationObserver(function(muts) {
                if (_wireRaf) return;
                for (var i = 0; i < muts.length; i++) {
                    if (muts[i].addedNodes && muts[i].addedNodes.length) {
                        _wireRaf = requestAnimationFrame(function() {
                            _wireRaf = 0;
                            wireProductCards();
                        });
                        break;
                    }
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
        }

        // Real-time multi-tab synchronization
        window.addEventListener('storage', function(e) {
            if (e.key === CART_KEY || e.key === WISH_KEY) {
                dtSyncBadges('storage');
            }
        });

        // Cross-component event hooks (update badges without redundant re-dispatch)
        window.addEventListener('dt:cart-updated', function() { dtSyncBadges('event'); });
        window.addEventListener('dt:wishlist-updated', function() { dtSyncBadges('event'); });
    }

    // ── Global Modal Scroll Lock, Escape & Bfcache Guard ─────────────────────
    function isFixedOpen(id, cls) {
        var el = document.getElementById(id);
        if (!el || !el.classList.contains(cls)) return false;
        try {
            return window.getComputedStyle(el).position === 'fixed';
        } catch (e) {
            return true;
        }
    }

    window.dtSyncBodyScrollLock = function() {
        if (!document.body) return;
        var hasOpenOverlay =
            isFixedOpen('checkoutBackdrop', 'active') ||
            isFixedOpen('cartDrawerModal', 'active') ||
            isFixedOpen('wishlistDrawerModal', 'active') ||
            isFixedOpen('quickViewOverlay', 'open') ||
            isFixedOpen('productDetailsModal', 'active') ||
            isFixedOpen('reelsModalOverlay', 'open') ||
            isFixedOpen('smartShareOverlay', 'active') ||
            isFixedOpen('homeMenuDrawerBackdrop', 'active') ||
            isFixedOpen('mfOverlay', 'open') ||
            isFixedOpen('sortOverlay', 'open') ||
            isFixedOpen('moreOverlay', 'open') ||
            isFixedOpen('policyQuickModal', 'active') ||
            isFixedOpen('pdpLightboxOverlay', 'open') ||
            isFixedOpen('pdpWaCheckoutModal', 'open') ||
            isFixedOpen('pdpWhatsAppOrderModal', 'open') ||
            isFixedOpen('pdpWriteReviewModal', 'open') ||
            isFixedOpen('pdpSizeGuideModal', 'open') ||
            isFixedOpen('pdpSizeChartModal', 'open') ||
            document.body.classList.contains('mobile-search-open');
        document.documentElement.classList.toggle('dt-scroll-locked', hasOpenOverlay);
        document.body.classList.toggle('dt-scroll-locked', hasOpenOverlay);
        document.body.classList.toggle('pdp-popup-active', hasOpenOverlay);
        document.body.style.overflow = hasOpenOverlay ? 'hidden' : '';
        if (hasOpenOverlay && typeof window.hidePdpMobileBar === 'function') {
            window.hidePdpMobileBar();
        } else if (!hasOpenOverlay && typeof window.showPdpMobileBar === 'function') {
            window.showPdpMobileBar();
        }
    };

    window.dtCloseTopModal = function() {
        var stack = [
            ['coUpiModalOverlay', 'active', 'closeUpiStudio'],
            ['checkoutBackdrop', 'active', 'closeCheckout'],
            ['pdpLightboxOverlay', 'open', 'closeFullscreenImage'],
            ['pdpWhatsAppOrderModal', 'open', 'closePdpWhatsAppOrderModal'],
            ['pdpWriteReviewModal', 'open', 'closeWriteReviewModal'],
            ['pdpSizeChartModal', 'open', 'closeSizeGuideModal'],
            ['pdpSizeGuideModal', 'open', 'closeSizeGuideModal'],
            ['smartShareOverlay', 'active', 'closeSmartShareModal'],
            ['productDetailsModal', 'active', 'closeProductDetails'],
            ['quickViewOverlay', 'open', 'closeQV'],
            ['cartDrawerModal', 'active', 'closeCartDrawer'],
            ['wishlistDrawerModal', 'active', 'closeWishlistDrawer'],
            ['reelsModalOverlay', 'open', 'closeReelsModal'],
            ['homeMenuDrawerBackdrop', 'active', function() { if (typeof window.toggleHomeMobileMenu === 'function') window.toggleHomeMobileMenu(false); }],
            ['mfOverlay', 'open', 'closeMobileFilter'],
            ['sortOverlay', 'open', 'closeSort'],
            ['moreOverlay', 'open', 'closeMore'],
            ['policyQuickModal', 'active', 'closePolicyModal']
        ];
        for (var i = 0; i < stack.length; i++) {
            var item = stack[i];
            if (isFixedOpen(item[0], item[1])) {
                if (typeof item[2] === 'function') {
                    item[2]();
                } else if (typeof window[item[2]] === 'function') {
                    window[item[2]]();
                }
                window.dtSyncBodyScrollLock();
                return true;
            }
        }
        return false;
    };

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            window.dtCloseTopModal();
        }
    });

    window.addEventListener('pageshow', function(e) {
        if (document.body) {
            document.body.classList.remove('mobile-search-open', 'mf-open', 'sort-open', 'more-open', 'qv-modal-open', 'reels-open', 'reels-modal-open', 'cart-open', 'wishlist-open', 'drawer-open');
            if (e.persisted) {
                ['cartDrawerModal', 'wishlistDrawerModal', 'checkoutBackdrop', 'smartShareOverlay', 'homeMenuDrawerBackdrop'].forEach(function(id) {
                    var el = document.getElementById(id);
                    if (el && window.getComputedStyle(el).position === 'fixed') el.classList.remove('active');
                });
                ['quickViewOverlay', 'reelsModalOverlay', 'mfOverlay', 'sortOverlay', 'moreOverlay'].forEach(function(id) {
                    var el = document.getElementById(id);
                    if (el) el.classList.remove('open');
                });
            }
            window.dtSyncBodyScrollLock();
        }
        dtSyncBadges('pageshow');
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.dtSyncBadges = dtSyncBadges;
    window.syncBadges = dtSyncBadges;
    window.dtToast = dtToast;
})();
