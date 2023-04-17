---
title: Android - Jetpack套件之 Lifecycle 使用
date: 2023-04-14 23:15:07
tags: RecyclerView
categories: Android
copyright: true
password:
---

> Android RecyclerView 缓存复用机制研究；

<!--more-->

## 1 RecyclerView 复用机制

在项目中，使用 RecyclerView 实现列表显示及滑动，其中 Item 分为了好几种 ViewType，每种 ViewType 的 item 内容不同，在实际**滑动**时发现当 item 条数比较多时，会出现 Item 显示错乱的情况，那么这就是因为 RecyclerView 缓存复用导致的，分析入口有两个：

- 既然是在滑动过程中存在的问题，所以刻意从 RecyclerView 的滑动事件开始研究，即 onTouchEvent() 的 ACTION_MOVE；
- 从 RecyclerView 的布局入手，即 onLayout()；

### 1.1 滑动事件入口 - onTouchEvent()

``` java
// RecyclerView.java
    public boolean onTouchEvent(MotionEvent e) {
            case MotionEvent.ACTION_MOVE: {
                ...
                    // scrollByInternal
                    if (scrollByInternal(
                            canScrollHorizontally ? dx : 0,
                            canScrollVertically ? dy : 0,
                            e)) {
                        getParent().requestDisallowInterceptTouchEvent(true);
                    }
                    if (mGapWorker != null && (dx != 0 || dy != 0)) {
                        mGapWorker.postFromTraversal(this, dx, dy);
                    }
                }
            } break;

    boolean scrollByInternal(int x, int y, MotionEvent ev) {
        int unconsumedX = 0;
        int unconsumedY = 0;
        int consumedX = 0;
        int consumedY = 0;

        consumePendingUpdateOperations();
        if (mAdapter != null) {
            mReusableIntPair[0] = 0;
            mReusableIntPair[1] = 0;
            scrollStep(x, y, mReusableIntPair); //
            consumedX = mReusableIntPair[0];
            consumedY = mReusableIntPair[1];
            unconsumedX = x - consumedX;
            unconsumedY = y - consumedY;
        }


    void scrollStep(int dx, int dy, @Nullable int[] consumed) {
        startInterceptRequestLayout();
        onEnterLayoutOrScroll();

        TraceCompat.beginSection(TRACE_SCROLL_TAG);
        fillRemainingScrollValues(mState);

        int consumedX = 0;
        int consumedY = 0;
        if (dx != 0) { // 横向滑动
            consumedX = mLayout.scrollHorizontallyBy(dx, mRecycler, mState);
        }
        if (dy != 0) { // 纵向滑动
            consumedY = mLayout.scrollVerticallyBy(dy, mRecycler, mState);
        }

// LinearLayoutManager.java
    public int scrollVerticallyBy(int dy, RecyclerView.Recycler recycler,
            RecyclerView.State state) {
        if (mOrientation == HORIZONTAL) {
            return 0;
        }
        return scrollBy(dy, recycler, state); //
    }

    int scrollBy(int delta, RecyclerView.Recycler recycler, RecyclerView.State state) {
        if (getChildCount() == 0 || delta == 0) {
            return 0;
        }
        ensureLayoutState();
        mLayoutState.mRecycle = true;
        final int layoutDirection = delta > 0 ? LayoutState.LAYOUT_END : LayoutState.LAYOUT_START;
        final int absDelta = Math.abs(delta);
        updateLayoutState(layoutDirection, absDelta, true, state);
        final int consumed = mLayoutState.mScrollingOffset
                + fill(recycler, mLayoutState, state, false); // 调用到 fill()
        

```

### 1.2 布局入口 - onLayout()

``` java
// RecyclerView.java
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        Trace.beginSection(TRACE_ON_LAYOUT_TAG);
        dispatchLayout();
        Trace.endSection();
        mFirstLayoutComplete = true;
    }

    void dispatchLayout() {
        if (mAdapter == null) {
            Log.e(TAG, "No adapter attached; skipping layout");
            // leave the state in START
            return;
        }
        if (mLayout == null) {
            Log.e(TAG, "No layout manager attached; skipping layout");
            // leave the state in START
            return;
        }
        mState.mIsMeasuring = false;
        if (mState.mLayoutStep == State.STEP_START) {
            dispatchLayoutStep1();
            mLayout.setExactMeasureSpecsFrom(this);
            dispatchLayoutStep2();
        } else if (mAdapterHelper.hasUpdates() || mLayout.getWidth() != getWidth()
                || mLayout.getHeight() != getHeight()) {
            // First 2 steps are done in onMeasure but looks like we have to run again due to
            // changed size.
            mLayout.setExactMeasureSpecsFrom(this);
            dispatchLayoutStep2();
        } else {
            // always make sure we sync them (to ensure mode is exact)
            mLayout.setExactMeasureSpecsFrom(this);
        }
        dispatchLayoutStep3();
    }

    private void dispatchLayoutStep2() {
        eatRequestLayout();
        onEnterLayoutOrScroll();
        mState.assertLayoutStep(State.STEP_LAYOUT | State.STEP_ANIMATIONS);
        mAdapterHelper.consumeUpdatesInOnePass();
        mState.mItemCount = mAdapter.getItemCount();
        mState.mDeletedInvisibleItemCountSincePreviousLayout = 0;

        // Step 2: Run layout
        mState.mInPreLayout = false;
        mLayout.onLayoutChildren(mRecycler, mState);

        mState.mStructureChanged = false;
        mPendingSavedState = null;

        // onLayoutChildren may have caused client code to disable item animations; re-check
        mState.mRunSimpleAnimations = mState.mRunSimpleAnimations && mItemAnimator != null;
        mState.mLayoutStep = State.STEP_ANIMATIONS;
        onExitLayoutOrScroll();
        resumeRequestLayout(false);
    }
```

onLayoutChildren()

``` java
// LinearLayoutManager.java
    private LayoutState mLayoutState;
    public void onLayoutChildren(RecyclerView.Recycler recycler, RecyclerView.State state) {
        
            fill(recycler, mLayoutState, state, false);
```

不管是滑动事件入口，还是布局入口，最后都会调用到 fill() 函数；

### 1.3 fill()

``` java
// LinearLayoutManager.java
    int fill(RecyclerView.Recycler recycler, LayoutState layoutState,
            RecyclerView.State state, boolean stopOnFocusable) {
        ...
        while ((layoutState.mInfinite || remainingSpace > 0) && layoutState.hasMore(state)) {
            layoutChunkResult.resetInternal();
            ...
            layoutChunk(recycler, state, layoutState, layoutChunkResult); // 用于四级复用

    // RecyclerView.Recycler 是处理缓存复用的
    void layoutChunk(RecyclerView.Recycler recycler, RecyclerView.State state,
            LayoutState layoutState, LayoutChunkResult result) {
        View view = layoutState.next(recycler); // 拿到 View
        if (view == null) {
            ...
        }
        RecyclerView.LayoutParams params = (RecyclerView.LayoutParams) view.getLayoutParams();
        if (layoutState.mScrapList == null) {
            if (mShouldReverseLayout == (layoutState.mLayoutDirection == LayoutState.LAYOUT_START)) {
                addView(view); // 添加 View
            } else {
                addView(view, 0);
            }
```

layoutChunk：用于四级复用；

``` java
// LinearLayoutManager.java
        View next(RecyclerView.Recycler recycler) {
            if (mScrapList != null) {
                return nextViewFromScrapList();
            }
            // 通过位置获取 View
            final View view = recycler.getViewForPosition(mCurrentPosition);
            mCurrentPosition += mItemDirection;
            return view;
        }
```

通过位置获取 View；

``` java
// RecyclerView.java
    public final class Recycler {
        public View getViewForPosition(int position) {
            return getViewForPosition(position, false);
        }

        View getViewForPosition(int position, boolean dryRun) {
            return tryGetViewHolderForPositionByDeadline(position, dryRun, FOREVER_NS).itemView;
        }
```

### 1.4 四级缓存

四级缓存如下：

- mChangeScrap 与 mAttachedScrap：用来缓存还在屏幕内的 ViewHolder；
- mCachedViews：用来缓存滑动到屏幕之外的 ViewHolder；
- mViewCacheExtension：这个的创建和缓存完全由开发者自己控制，系统未往这里添加数据；
- RecycledViewPool：ViewHolder 缓存池；

``` java
// RecyclerView.java
    public final class Recycler {
        ViewHolder tryGetViewHolderForPositionByDeadline(int position, boolean dryRun, long deadlineNs) { // 处理复用
            ...
            boolean fromScrapOrHiddenOrCache = false;
            ViewHolder holder = null;
            // 0) If there is a changed scrap, try to find from there
            if (mState.isPreLayout()) {
                holder = getChangedScrapViewForPosition(position); // 从 mChangeScrap 获取
                fromScrapOrHiddenOrCache = holder != null;
            }
            // 1) Find by position from scrap/hidden list/cache
            if (holder == null) {
                holder = getScrapOrHiddenOrCachedHolderForPosition(position, dryRun); // 从 mAttachedScrap/mCachedViews 获取
                if (holder != null) {
                    ...
                }
            }
            if (holder == null) {
                final int offsetPosition = mAdapterHelper.findPositionOffset(position);
                ...
                final int type = mAdapter.getItemViewType(offsetPosition);
                // 2) Find from scrap/cache via stable ids, if exists
                if (mAdapter.hasStableIds()) {
                    holder = getScrapOrCachedViewForId(mAdapter.getItemId(offsetPosition), type, dryRun); // 通过 id 获取
                    if (holder != null) {
                        // update position
                        holder.mPosition = offsetPosition;
                        fromScrapOrHiddenOrCache = true;
                    }
                }
                if (holder == null && mViewCacheExtension != null) {
                    // We are NOT sending the offsetPosition because LayoutManager does not
                    // know it.
                    final View view = mViewCacheExtension.getViewForPositionAndType(this, position, type);
                    if (view != null) {
                        holder = getChildViewHolder(view);
                        ...
                    }
                }
                if (holder == null) { // fallback to pool
                    ...
                    holder = getRecycledViewPool().getRecycledView(type);
                    ...
                }
                if (holder == null) {
                    long start = getNanoTime();
                    ...
                    holder = mAdapter.createViewHolder(RecyclerView.this, type); // 创建 ViewHolder
                    ...
                    long end = getNanoTime();
                    mRecyclerPool.factorInCreateTime(type, end - start);
                    if (DEBUG) {
                        Log.d(TAG, "tryGetViewHolderForPositionByDeadline created new ViewHolder");
                    }
                }
            }
            ...
```

返回的是 ViewHolder，所以复用的就是 ViewHolder，ViewHolder 可以理解为一个 itemview；

#### 1.4.1 mChangeScrap

getChangedScrapViewForPosition()

``` java
// RecyclerView.java
        ViewHolder getChangedScrapViewForPosition(int position) {
            // If pre-layout, check the changed scrap for an exact match.
            ...
            // find by position
            for (int i = 0; i < changedScrapSize; i++) {
                final ViewHolder holder = mChangedScrap.get(i); // 通过 position 获取
                if (!holder.wasReturnedFromScrap() && holder.getLayoutPosition() == position) {
                    holder.addFlags(ViewHolder.FLAG_RETURNED_FROM_SCRAP);
                    return holder;
                }
            }
            // find by id
            if (mAdapter.hasStableIds()) {
                final int offsetPosition = mAdapterHelper.findPositionOffset(position);
                if (offsetPosition > 0 && offsetPosition < mAdapter.getItemCount()) {
                    final long id = mAdapter.getItemId(offsetPosition);
                    for (int i = 0; i < changedScrapSize; i++) {
                        final ViewHolder holder = mChangedScrap.get(i); // 通过 id 获取
                        if (!holder.wasReturnedFromScrap() && holder.getItemId() == id) {
                            holder.addFlags(ViewHolder.FLAG_RETURNED_FROM_SCRAP);
                            return holder;
                        ...
            return null;
        }
```



#### 1.4.2 mAttachedScrap/mCachedViews

##### 1.4.2.1 通过位置获取

getScrapOrHiddenOrCachedHolderForPosition()

``` java
// RecyclerView.java
        ViewHolder getScrapOrHiddenOrCachedHolderForPosition(int position, boolean dryRun) {
            final int scrapCount = mAttachedScrap.size();

            // Try first for an exact, non-invalid match from scrap.
            for (int i = 0; i < scrapCount; i++) {
                final ViewHolder holder = mAttachedScrap.get(i); // mAttachedScrap
                if (!holder.wasReturnedFromScrap() && holder.getLayoutPosition() == position
                        && !holder.isInvalid() && (mState.mInPreLayout || !holder.isRemoved())) {
                    holder.addFlags(ViewHolder.FLAG_RETURNED_FROM_SCRAP);
                    return holder;
                }
            }
            ...
            // Search in our first-level recycled view cache.
            final int cacheSize = mCachedViews.size();
            for (int i = 0; i < cacheSize; i++) {
                final ViewHolder holder = mCachedViews.get(i); // mCachedViews 第一层缓存
                ...
```

##### 1.4.2.2 通过 id 获取

getScrapOrCachedViewForId()

``` java
// RecyclerView.java
        ViewHolder getScrapOrCachedViewForId(long id, int type, boolean dryRun) {
            // Look in our attached views first
            final int count = mAttachedScrap.size(); // mAttachedScrap
            for (int i = count - 1; i >= 0; i--) {
                final ViewHolder holder = mAttachedScrap.get(i);
                ...
            // Search the first-level cache
            final int cacheSize = mCachedViews.size();
            for (int i = cacheSize - 1; i >= 0; i--) {
                final ViewHolder holder = mCachedViews.get(i); // mCachedViews
                if (holder.getItemId() == id) {
                    if (type == holder.getItemViewType()) {
                        if (!dryRun) {
                            mCachedViews.remove(i);
                        }
                        return holder;
                    ...
```



#### 1.4.3 mViewCacheExtension - 自定义缓存和复用

getViewForPositionAndType()

先自定义缓存，再自定义复用，用的比较少

#### 1.4.4 RecycledViewPool - 从缓存池获取

getRecycledViewPool().getRecycledView()

``` java
// RecyclerView.java
        public ViewHolder getRecycledView(int viewType) {
            final ScrapData scrapData = mScrap.get(viewType);
            if (scrapData != null && !scrapData.mScrapHeap.isEmpty()) {
                final ArrayList<ViewHolder> scrapHeap = scrapData.mScrapHeap;
                return scrapHeap.remove(scrapHeap.size() - 1);
            }
            return null;
        }
```

#### 1.4.5 直接创建 ViewHolder

mAdapter.createViewHolder()，调用 onCreateViewHolder

``` java
// RecyclerView.java
        ViewHolder tryGetViewHolderForPositionByDeadline(int position, boolean dryRun, long deadlineNs) {
                if (holder == null) {
                    ...
                    holder = mAdapter.createViewHolder(RecyclerView.this, type); // 直接创建
                    ...}
        }

        public final VH createViewHolder(ViewGroup parent, int viewType) {
            Trace.beginSection(TRACE_CREATE_VIEW_TAG);
            final VH holder = onCreateViewHolder(parent, viewType);
            holder.mItemViewType = viewType;
            Trace.endSection();
            return holder;
        }
```

#### 1.4.6 绑定 ViewHolder

tryBindViewHolderByDeadline() -> mAdapter.bindViewHolder() -> onBindViewHolder()

``` java
// RecyclerView.java
        ViewHolder tryGetViewHolderForPositionByDeadline(int position, boolean dryRun, long deadlineNs) {
            boolean bound = false;
            if (mState.isPreLayout() && holder.isBound()) {
                // do not update unless we absolutely have to.
                holder.mPreLayoutPosition = position;
            } else if (!holder.isBound() || holder.needsUpdate() || holder.isInvalid()) {
                ...
                final int offsetPosition = mAdapterHelper.findPositionOffset(position);
                bound = tryBindViewHolderByDeadline(holder, offsetPosition, position, deadlineNs); // 
            }

        private boolean tryBindViewHolderByDeadline(ViewHolder holder, int offsetPosition,
                int position, long deadlineNs) {
            holder.mOwnerRecyclerView = RecyclerView.this;
            final int viewType = holder.getItemViewType();
            long startBindNs = getNanoTime();
            ...
            mAdapter.bindViewHolder(holder, offsetPosition);
            ...
            return true;
        }

        public final void bindViewHolder(VH holder, int position) {
            holder.mPosition = position;
            ...
            onBindViewHolder(holder, position, holder.getUnmodifiedPayloads());
            ...
```

### 1.5 总结

- 首先从 mChangeScrap 中获取 ViewHolder；
- 如果没有获取到，则从 mAttachedScrap / mCachedViews 中获取；
- 如果还没有获取到，则从自定义缓存 mViewCacheExtension 获取；
- 如果依然没有获取到，则从 RecycledViewPool 中获取；
- 如果都没有获取到，就直接通过 mAdapter.createViewHolder 创建 ViewHolder；
- 最后通过 bindViewHolder -> onBindViewHolder 绑定 ViewHolder；

待补充f复用流程时序图

## 2 RecyclerView 缓存机制

同样在滑动事件和布局都有入口，首先是滑动事件的缓存入口：

### 2.1 滑动事件缓存入口

``` java
// LinearLayoutManager.java
    int fill(RecyclerView.Recycler recycler, LayoutState layoutState,
            RecyclerView.State state, boolean stopOnFocusable) {
        // max offset we should set is mFastScroll + available
        final int start = layoutState.mAvailable;
        if (layoutState.mScrollingOffset != LayoutState.SCROLLING_OFFSET_NaN) {
            // TODO ugly bug fix. should not happen
            if (layoutState.mAvailable < 0) {
                layoutState.mScrollingOffset += layoutState.mAvailable;
            }
            recycleByLayoutState(recycler, layoutState); // 缓存 ViewHolder
        }
```

recycleByLayoutState() 就是缓存 ViewHolder 的入口了；

``` java
// LinearLayoutManager.java
    private void recycleByLayoutState(RecyclerView.Recycler recycler, LayoutState layoutState) {
        if (!layoutState.mRecycle || layoutState.mInfinite) {
            return;
        }
        if (layoutState.mLayoutDirection == LayoutState.LAYOUT_START) {
            recycleViewsFromEnd(recycler, layoutState.mScrollingOffset); // 缓存尾部(向上滑)
        } else {
            recycleViewsFromStart(recycler, layoutState.mScrollingOffset); // 缓存顶部(向下滑)
        }
    }
```

recycleViewsFromEnd 和 recycleViewsFromStart 分别是缓存尾部和缓存底部，分别对应向上滑和向下滑，选择缓存顶部看一下：

``` java
// LinearLayoutManager.java
    private void recycleViewsFromStart(RecyclerView.Recycler recycler, int dt) {
        ...
        final int limit = dt;
        final int childCount = getChildCount();
        if (mShouldReverseLayout) {
            for (int i = childCount - 1; i >= 0; i--) {
                View child = getChildAt(i);
                if (mOrientationHelper.getDecoratedEnd(child) > limit
                        || mOrientationHelper.getTransformedEndWithDecoration(child) > limit) {
                    // stop here
                    recycleChildren(recycler, childCount - 1, i); //
                    return;
                }
            }
        } else {
            for (int i = 0; i < childCount; i++) {
                View child = getChildAt(i);
                if (mOrientationHelper.getDecoratedEnd(child) > limit
                        || mOrientationHelper.getTransformedEndWithDecoration(child) > limit) {
                    // stop here
                    recycleChildren(recycler, 0, i); //
                    return;
                }
            }
        }
    }
```

两个分支都会调用到 recycleChildren()；

``` java
// LinearLayoutManager.java
    private void recycleChildren(RecyclerView.Recycler recycler, int startIndex, int endIndex) {
        ...
        if (endIndex > startIndex) {
            for (int i = endIndex - 1; i >= startIndex; i--) {
                removeAndRecycleViewAt(i, recycler); //
            }
        } else {
            for (int i = startIndex; i > endIndex; i--) {
                removeAndRecycleViewAt(i, recycler);//
            }
        }
    }
```

继续调用 removeAndRecycleViewAt()；

``` java
// RecyclerView.java
        public void removeAndRecycleViewAt(int index, Recycler recycler) {
            final View view = getChildAt(index);
            removeViewAt(index);
            recycler.recycleView(view); //
        }
```



``` java

        public void recycleView(View view) {
            // This public recycle method tries to make view recycle-able since layout manager
            // intended to recycle this view (e.g. even if it is in scrap or change cache)
            ViewHolder holder = getChildViewHolderInt(view);
            if (holder.isTmpDetached()) {
                removeDetachedView(view, false);
            }
            if (holder.isScrap()) {
                holder.unScrap();
            } else if (holder.wasReturnedFromScrap()) {
                holder.clearReturnedFromScrapFlag();
            }
            recycleViewHolderInternal(holder); // 重点
        }
```

重点是 recycleViewHolderInternal()；

### 2.2 布局缓存入口

``` java
// LinearLayoutManager.java
    public void onLayoutChildren(RecyclerView.Recycler recycler, RecyclerView.State state) {
        detachAndScrapAttachedViews(recycler);
```

LinearLayoutManager 并没有重写 detachAndScrapAttachedViews()，要从父类 RecyclerView 中查看：

``` java
// RecyclerView.java
        public void detachAndScrapAttachedViews(Recycler recycler) {
            final int childCount = getChildCount();
            for (int i = childCount - 1; i >= 0; i--) {
                final View v = getChildAt(i);
                scrapOrRecycleView(recycler, i, v);
            }
        }
```

继续调用 scrapOrRecycleView()；

``` java
// RecyclerView.java
        private void scrapOrRecycleView(Recycler recycler, int index, View view) {
            final ViewHolder viewHolder = getChildViewHolderInt(view);
            ...
            if (viewHolder.isInvalid() && !viewHolder.isRemoved()
                    && !mRecyclerView.mAdapter.hasStableIds()) {
                removeViewAt(index);
                recycler.recycleViewHolderInternal(viewHolder); // 缓存 mCachedViews 和 RecycledViewPool
            } else {
                detachViewAt(index);
                recycler.scrapView(view); // 缓存 mChangedScrap 和 mAttachedScrap
                mRecyclerView.mViewInfoStore.onViewDetached(viewHolder);
            }
        }
```

这里有两个分支，分别用来缓存到不同的列表：

- recycleViewHolderInternal：缓存 **mCachedViews** 和 **RecycledViewPool**，滑动和布局都会缓存；
- scrapView：缓存 **mChangedScrap** 和 **mAttachedScrap**，只有布局会缓存；

### 2.3 recycleViewHolderInternal() - 缓存 mCachedViews 和 RecycledViewPool

``` java
// RecyclerView.java
        static final int DEFAULT_CACHE_SIZE = 2;
        int mViewCacheMax = DEFAULT_CACHE_SIZE; // 最大值为 2
        void recycleViewHolderInternal(ViewHolder holder) {
           ...
            //noinspection unchecked
            final boolean transientStatePreventsRecycling = holder
                    .doesTransientStatePreventRecycling();
            final boolean forceRecycle = mAdapter != null
                    && transientStatePreventsRecycling
                    && mAdapter.onFailedToRecycleView(holder);
            boolean cached = false;
            boolean recycled = false;
            ...
            if (forceRecycle || holder.isRecyclable()) {
                if (mViewCacheMax > 0
                        && !holder.hasAnyOfTheFlags(ViewHolder.FLAG_INVALID
                                | ViewHolder.FLAG_REMOVED
                                | ViewHolder.FLAG_UPDATE
                                | ViewHolder.FLAG_ADAPTER_POSITION_UNKNOWN)) {
                    // Retire oldest cached view
                    int cachedViewSize = mCachedViews.size();
                    if (cachedViewSize >= mViewCacheMax && cachedViewSize > 0) { // 如果 mViewCacheMax 满了
                        // 把 mCachedViews 第 0 个元素取出放入 RecucledViewPool 并从 mCachedViews 移除
                        recycleCachedViewAt(0);
                        cachedViewSize--;
                    }

                    int targetCacheIndex = cachedViewSize;
                    ...
                    mCachedViews.add(targetCacheIndex, holder); // 添加到 mCachedViews 中
                    cached = true;
                }
                if (!cached) {
                    addViewHolderToRecycledViewPool(holder, true); // ViewHolder 存在 if 分支的任一标记，则直接缓存到缓冲池
                    recycled = true;
                }
            } else {...}
```

如果 mViewCache 存满了，即已经有 2 个ViewHolder 了，就调用 recycleCachedViewAt() 取出 index 为 0 的元素添加到 RecycledViewPool；

``` java
// RecyclerView.java
        void recycleCachedViewAt(int cachedViewIndex) {
            ...
            ViewHolder viewHolder = mCachedViews.get(cachedViewIndex); // 取出
            addViewHolderToRecycledViewPool(viewHolder, true); // 添加到 RecycledViewPool
            mCachedViews.remove(cachedViewIndex); // 移除
        }

```

addViewHolderToRecycledViewPool()：添加 ViewHolder 到 RecycledViewHolder；

``` java

        void addViewHolderToRecycledViewPool(ViewHolder holder, boolean dispatchRecycled) {
            clearNestedRecyclerViewIfNotNested(holder);
            holder.itemView.setAccessibilityDelegate(null);
            if (dispatchRecycled) {
                dispatchViewRecycled(holder);
            }
            holder.mOwnerRecyclerView = null;
            getRecycledViewPool().putRecycledView(holder); //
        }

        SparseArray<ScrapData> mScrap = new SparseArray<>();
        public void putRecycledView(ViewHolder scrap) {
            final int viewType = scrap.getItemViewType(); // 获取 ViewHolder 的类型
            // 获取 ScrapData 中的 mScrapHeap，是一个 List，存的是 ViewHolder
            final ArrayList scrapHeap = getScrapDataForType(viewType).mScrapHeap;
            // 如果存放 ViewHolder 的 scrapHeap 的 size 已经超过最大值了，就直接返回
            if (mScrap.get(viewType).mMaxScrap <= scrapHeap.size()) {
                return;
            }
            ...
            scrap.resetInternal(); // 重置
            scrapHeap.add(scrap); // 添加到 scrapHeap 中
        }
```

mScrap 是一个 SparseArray，mScrap.get(viewType) 则是一个 ScrapData，mMaxScrap 定义在 ScrapData 中：

``` java
// RecyclerView.java
    public static class RecycledViewPool {
        private static final int DEFAULT_MAX_SCRAP = 5; // 存放 ViewHolder 的 list 最大值为 5
        static class ScrapData {
            ArrayList<ViewHolder> mScrapHeap = new ArrayList<>();
            int mMaxScrap = DEFAULT_MAX_SCRAP;
            long mCreateRunningAverageNs = 0;
            long mBindRunningAverageNs = 0;
        }
```

如果存放 ViewHolder 的 scrapHeap 的 size 已经超过最大值了，就直接返回，否则把需要放入 RecyclerViewPool 的 ViewHolder 存入 scrapHeap 中，即 RecyclerViewPool 中每个 ViewType 对应一个 ScrapData，每个 ScrapData 中有一个保存 ViewHolder 的列表，这个列表的大小为 5，也就是说每种 ViewType 的 ViewHolder 在缓冲池子中的大小都为 5，当不满的时候，先把要缓存的 ViewHolder 重置，然后再放入 scrapHeap 中，所以缓冲池中保存的 ViewHolder 是空白的不带数据的 ViewHolder；

### 2.4 scrapView() - 缓存 mChangedScrap 和 mAttachedScrap

``` java
// RecyclerView.java
        void scrapView(View view) {
            final ViewHolder holder = getChildViewHolderInt(view);
            if (holder.hasAnyOfTheFlags(ViewHolder.FLAG_REMOVED | ViewHolder.FLAG_INVALID)
                    || !holder.isUpdated() || canReuseUpdatedViewHolder(holder)) {
                ...
                holder.setScrapContainer(this, false);
                mAttachedScrap.add(holder); // 缓存到 mAttachedScrap
            } else {
                if (mChangedScrap == null) {
                    mChangedScrap = new ArrayList<ViewHolder>();
                }
                holder.setScrapContainer(this, true);
                mChangedScrap.add(holder); // 缓存到 mChangedScrap
            }
        }
```

### 2.5 总结

对于滑动事件缓存，只会缓存 mCachedViews 和 RecycledViewPool，

- mCachedViews：size 为 2，是一个队列，划出屏幕的 ViewHolder 会依次保存到 index 为 0 的元素中，当 size 大于等于 2 时，
  - 如果 RecycledViewPool 对应 ViewType 的列表没满 5 个，就把 mCachedViews 中第 0 个元素取出放入 RecycledViewPool，把第 1 个元素移到第 0 个位置；
  - 如果 RecycledViewPool 已经满了，则直接丢弃第 0 个元素，把第 1 个元素移到第 0 个位置；
- RecycledViewPool：size 为 5，里面根据 ViewType 存放了很多 ScrapData，每个 ScrapData 保存一个 size 为 5 的存放 ViewHolder 的 mScrapHeap 列表，列表中存放的是经过重置的 ViewHolder；

对于布局流程的缓存，除了上面两种，还缓存了 mChangedScrap 和 mAttachedScrap；

待补充缓存流程时序图

[Ref](https://juejin.cn/post/7021059826495176735)
