<div class="copyright" >
  {% set current = date(Date.now(), "YYYY") %}
  &copy; {% if theme.since and theme.since != current %} {{ theme.since }} - {% endif %}
  <span itemprop="copyrightYear">{{ current }}</span>
  <span class="with-love">
    <i class="fa fa-{{ theme.authoricon }}"></i>
  </span>
  <span class="author" itemprop="copyrightHolder">{{ config.author }}</span>
</div>

{% if theme.copyright %}
<!--
<div class="powered-by">
  {{ __('footer.powered', '<a class="theme-link" href="https://hexo.io">Hexo</a>') }}
</div>

<div class="theme-info">
  {{ __('footer.theme') }} -
  <a class="theme-link" href="https://github.com/iissnan/hexo-theme-next">
    NexT.{{ theme.scheme }}
  </a>
</div>
-->
{% endif %}

<!--<script async src="//dn-lbstatics.qbox.me/busuanzi/2.3/busuanzi.pure.mini.js">
</script>

<div class="count">
  <span id="busuanzi_container_site_pv" style='display:none'>
  <i class="fa fa-user" aria-hidden="true"></i>
    <span id="busuanzi_value_site_pv"></span>&nbsp;&nbsp;
  </span>

  <span id="busuanzi_container_site_uv" style='display:none'>
  <i class="fa fa-eye" aria-hidden="true"></i>
    <span id="busuanzi_value_site_uv"></span>&nbsp;&nbsp;
  </span>

  <span id="busuanzi_container_page_pv" style='display:none'>
    ★阅读量<span id="busuanzi_value_page_pv"></span>&nbsp;&nbsp;
  </span>

  <span class="post-count">全站共{{ totalcount(site) }}字</span>
</div>-->
