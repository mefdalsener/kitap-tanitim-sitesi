using HtmlAgilityPack;
using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;
using OpenQA.Selenium.Support.UI;
using System.Text.RegularExpressions;

namespace KitapTanitimSitesi.Services
{
    public class BookScraperService
    {
        private readonly HttpClient _httpClient;

        public BookScraperService(IHttpClientFactory httpClientFactory)
        {
            _httpClient = httpClientFactory.CreateClient();
            _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36");
        }

        public async Task<SchemaResult> ScrapeAsync(string kitapyurduUrl, string goodreadsUrl)
        {
            var result = new SchemaResult();

            if (!string.IsNullOrWhiteSpace(kitapyurduUrl))
                if (!string.IsNullOrWhiteSpace(kitapyurduUrl))
                {
                    result.KitapyurduUrl = kitapyurduUrl;
                    await ScrapeKitapyurduAsync(kitapyurduUrl, result);
                }

            // Goodreads linki elle verilmediyse, ISBN üzerinden Selenium ile çözülür
            // (Goodreads search -> book/show yönlendirmesi JavaScript tabanlı olduğu için
            // HttpClient/GetAsync bunu YAKALAYAMAZ, tarayıcı gerekir).
            if (string.IsNullOrWhiteSpace(goodreadsUrl) && !string.IsNullOrWhiteSpace(result.BookPublishers.ISBN))
                goodreadsUrl = ResolveGoodreadsBookUrl(result.BookPublishers.ISBN);

            if (!string.IsNullOrWhiteSpace(goodreadsUrl))
                await ScrapeGoodreadsAsync(goodreadsUrl, result);

            return result;
        }

        // ================== KİTAPYURDU ==================
        private async Task ScrapeKitapyurduAsync(string url, SchemaResult result)
        {
            var doc = await GetHtmlAsync(url);

            result.Books.BookName = CleanTextSingleLine(doc.DocumentNode
                .SelectSingleNode("//h1[@class='pr_header__heading']")?.InnerText);

            // ---- Yazarlar (çoklu) ----
            // "pr_producers__manufacturer" div'i içinde her yazar ayrı bir
            // "pr_producers__item" div'inde, kendi "a.pr_producers__link" linkiyle gelir.
            var authorNodes = doc.DocumentNode
                .SelectNodes("//div[@class='pr_producers__manufacturer']//a[@class='pr_producers__link']");

            if (authorNodes != null)
            {
                foreach (var node in authorNodes)
                {
                    var fullAuthorName = CleanTextSingleLine(node.InnerText);
                    if (string.IsNullOrEmpty(fullAuthorName)) continue;

                    SplitNameSurname(fullAuthorName, out var aName, out var aSurname);
                    result.Authors.Add(new AuthorsDto { AuthorName = aName, AuthorSurname = aSurname });
                }
            }

            result.Publishers.PublisherName = CleanTextSingleLine(doc.DocumentNode
                .SelectSingleNode("//div[@class='pr_producers__publisher']//a[@class='pr_producers__link']")?.InnerText);

            // ---- Çevirmenler (çoklu) ----
            // "attributes" tablosunda birden fazla "Çevirmen:" satırı olabilir, hepsini topluyoruz.
            var rows = doc.DocumentNode.SelectNodes("//div[@class='attributes']//tr");
            if (rows != null)
            {
                foreach (var row in rows)
                {
                    var cells = row.SelectNodes("td");
                    if (cells == null || cells.Count < 2) continue;

                    var label = cells[0].InnerText.Trim();
                    var value = CleanTextSingleLine(cells[1].InnerText);

                    if (label.Contains("Çevirmen"))
                    {
                        if (string.IsNullOrEmpty(value)) continue;
                        SplitNameSurname(value, out var tName, out var tSurname);
                        result.Translators.Add(new TranslatorsDto { TranslatorName = tName, TranslatorSurname = tSurname });
                    }
                    else if (label.Contains("ISBN")) result.BookPublishers.ISBN = value;
                    else if (label.Contains("Sayfa Sayısı")) result.BookPublishers.PageCount = ParseInt(value);
                    else if (label.Contains("Yayın Tarihi")) result.BookPublishers.PublishYear = ExtractYear(value);
                }
            }
        }

        // ================== GOODREADS ==================
        private async Task ScrapeGoodreadsAsync(string url, SchemaResult result)
        {
            // Bu noktaya gelen url zaten çözülmüş gerçek "book/show" linkidir
            // (ResolveGoodreadsBookUrl tarafından bulunmuş ya da admin panelden elle girilmiştir).
            result.GoodreadsUrl = url;

            var doc = await GetHtmlAsync(url);

            result.Books.BookCoverImage_URL = doc.DocumentNode
                .SelectSingleNode("//div[@class='BookCover__image']//img")?.GetAttributeValue("src", null);

            var descNode = doc.DocumentNode.SelectSingleNode("//span[@class='Formatted']");
            result.Books.BookDescription = CleanTextParagraphs(descNode?.InnerHtml);

            var pubInfoRaw = doc.DocumentNode.SelectSingleNode("//p[@data-testid='publicationInfo']")?.InnerText;
            result.Books.FirstPublishYear = ExtractYear(pubInfoRaw);

            var genreNodes = doc.DocumentNode
                .SelectNodes("//div[@data-testid='genresList']//span[@class='Button__labelItem']");
            result.Genres = genreNodes?
                .Select(g => g.InnerText.Trim())
                .Where(g => g != "...more")
                .ToList() ?? new List<string>();

            // ---- Katkıda bulunanlar (ContributorLinksList): Yazar / Çevirmen / Editör karışık gelir ----
            // Rolü olmayan (role span'i yok) katkıda bulunanlar YAZAR'dır.
            // Rolü "Translator" olanlar ÇEVİRMEN, "Editor" olanlar tamamen ATLANIR.
            var contributorContainer = doc.DocumentNode.SelectSingleNode("//div[@class='ContributorLinksList']");
            var contributorNodes = contributorContainer?.SelectNodes(".//a[@class='ContributorLink']");

            if (contributorNodes != null)
            {
                foreach (var node in contributorNodes)
                {
                    var nameNode = node.SelectSingleNode(".//span[@class='ContributorLink__name']");
                    var fullName = CleanTextSingleLine(nameNode?.InnerText);
                    if (string.IsNullOrEmpty(fullName)) continue;

                    var roleNode = node.SelectSingleNode(".//span[@data-testid='role']");
                    var role = CleanTextSingleLine(roleNode?.InnerText); // örn: "(Translator)", "(Editor)"

                    // Çevirmen bilgisi zaten Kitapyurdu'ndan alınıyor; Goodreads'te "Translator"
                    // veya "Editor" rolü görünen katkıda bulunanlar yazar değildir, tamamen atlanır.
                    if (role != null && (role.Contains("Translator") || role.Contains("Editor")))
                    {
                        continue;
                    }

                    // Rol yok -> gerçek yazar. Yazar sayfasına gidip ek bilgileri (foto, biyografi,
                    // doğum/ölüm yılı) çekiyoruz.
                    SplitNameSurname(fullName, out var aName, out var aSurname);
                    string authorImageUrl = null, authorBiography = null;
                    int? authorBirthYear = null, authorDeathYear = null;

                    var authorUrl = node.GetAttributeValue("href", null);
                    string fullAuthorUrl = null;
                    if (!string.IsNullOrEmpty(authorUrl))
                    {
                        fullAuthorUrl = authorUrl.StartsWith("http") ? authorUrl : "https://www.goodreads.com" + authorUrl;
                        var authorDoc = await GetHtmlAsync(fullAuthorUrl);

                        var imgSrc = authorDoc.DocumentNode
                            .SelectSingleNode("//img[@itemprop='image']")?.GetAttributeValue("src", null);

                        if (!string.IsNullOrEmpty(imgSrc))
                            authorImageUrl = Regex.Replace(imgSrc, @"p\d+/", "p8/");

                        var birthRaw = authorDoc.DocumentNode.SelectSingleNode("//div[@itemprop='birthDate']")?.InnerText;
                        authorBirthYear = ExtractYear(birthRaw);

                        var deathRaw = authorDoc.DocumentNode.SelectSingleNode("//div[@itemprop='deathDate']")?.InnerText;
                        authorDeathYear = ExtractYear(deathRaw);

                        var bioNode = authorDoc.DocumentNode
                            .SelectSingleNode("//div[@class='aboutAuthorInfo']//span[starts-with(@id,'freeTextauthor')]");
                        authorBiography = CleanTextParagraphs(bioNode?.InnerHtml);
                    }

                    // Kitapyurdu'ndan bu yazar zaten eklenmişse (isim eşleşmesiyle), mükerrer
                    // kayıt açmak yerine mevcut kaydı Goodreads'ten gelen ek bilgilerle tamamla.
                    var existingAuthor = result.Authors.FirstOrDefault(a =>
                        NormalizeForCompare(a.AuthorName) == NormalizeForCompare(aName) &&
                        NormalizeForCompare(a.AuthorSurname) == NormalizeForCompare(aSurname));

                    if (existingAuthor != null)
                    {
                        existingAuthor.AuthorImage_URL ??= authorImageUrl;
                        existingAuthor.AuthorBiography ??= authorBiography;
                        existingAuthor.AuthorBirthYear ??= authorBirthYear;
                        existingAuthor.AuthorDeathYear ??= authorDeathYear;
                        existingAuthor.AuthorUrl ??= fullAuthorUrl;
                    }
                    else
                    {
                        result.Authors.Add(new AuthorsDto
                        {
                            AuthorName = aName,
                            AuthorSurname = aSurname,
                            AuthorImage_URL = authorImageUrl,
                            AuthorBiography = authorBiography,
                            AuthorBirthYear = authorBirthYear,
                            AuthorDeathYear = authorDeathYear,
                            AuthorUrl = fullAuthorUrl
                        });
                    }
                }
            }
        }

        // Yazar/çevirmen isimlerini karşılaştırırken küçük harfe çevirip boşlukları sadeleştirir
        // (Kitapyurdu ve Goodreads'ten gelen aynı kişinin mükerrer eklenmesini önlemek için).
        private string NormalizeForCompare(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            return Regex.Replace(text.Trim().ToLowerInvariant(), "\\s+", " ");
        }

        // ================== GOODREADS LİNK ÇÖZÜMLEME (SELENIUM) ==================
        // ISBN'i Goodreads search'e verir, JS yönlendirmesi tamamlanana kadar (max 10 sn) bekler,
        // sonra oluşan gerçek "book/show" linkini döndürür.
        private string ResolveGoodreadsBookUrl(string isbn)
        {
            var searchUrl = $"https://www.goodreads.com/search?q={Uri.EscapeDataString(isbn)}";

            var options = new ChromeOptions();
            options.AddArgument("--headless=new");
            options.AddArgument("--no-sandbox");
            options.AddArgument("--disable-gpu");
            options.AddArgument("--window-size=1280,800");
            options.AddArgument(
                "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36");

            using var driver = new ChromeDriver(options);
            try
            {
                driver.Navigate().GoToUrl(searchUrl);

                var wait = new WebDriverWait(driver, TimeSpan.FromSeconds(10));
                wait.Until(d => d.Url.Contains("/book/show/"));

                return driver.Url;
            }
            catch (WebDriverTimeoutException)
            {
                // 10 saniyede yönlendirme gerçekleşmediyse (örn. arama tek sonuca düşmediyse)
                // en azından search URL'sini geri döndür, kazıma tarafı boş alanlarla karşılaşır.
                return driver.Url;
            }
            finally
            {
                driver.Quit();
            }
        }

        // ================== YARDIMCI FONKSİYONLAR ==================
        private async Task<HtmlDocument> GetHtmlAsync(string url)
        {
            var html = await _httpClient.GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            return doc;
        }

        private string CleanTextSingleLine(string html)
        {
            if (string.IsNullOrEmpty(html)) return null;
            var decoded = System.Net.WebUtility.HtmlDecode(html);
            decoded = Regex.Replace(decoded, "<br\\s*/?>", " ");
            decoded = Regex.Replace(decoded, "<.*?>", "");
            decoded = Regex.Replace(decoded, "\\s+", " ");
            return decoded.Trim();
        }

        private string CleanTextParagraphs(string html)
        {
            if (string.IsNullOrEmpty(html)) return null;

            var decoded = System.Net.WebUtility.HtmlDecode(html);
            decoded = Regex.Replace(decoded, "(<br\\s*/?>\\s*){2,}", "|||PARA|||");
            decoded = Regex.Replace(decoded, "<br\\s*/?>", " ");
            decoded = Regex.Replace(decoded, "<.*?>", "");

            var paragraphs = decoded
                .Split("|||PARA|||")
                .Select(p => Regex.Replace(p.Trim(), "\\s+", " "))
                .Where(p => !string.IsNullOrWhiteSpace(p));

            return string.Join("\n\n", paragraphs);
        }

        private int? ParseInt(string text) => int.TryParse(text, out var n) ? n : null;

        private int? ExtractYear(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            var match = Regex.Match(text, @"\b(1[6-9]\d{2}|20\d{2})\b");
            return match.Success ? int.Parse(match.Value) : null;
        }

        private void SplitNameSurname(string fullName, out string name, out string surname)
        {
            var parts = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 1)
            {
                name = parts[0];
                surname = "";
            }
            else
            {
                surname = parts[^1];
                name = string.Join(' ', parts[..^1]);
            }
        }
    }

    // ================== DTO'LAR ==================
    public class SchemaResult
    {
        public BooksDto Books { get; set; } = new();
        // ---- ÇOKLU YAZAR / ÇEVİRMEN DESTEĞİ ----
        // Kitapyurdu ve Goodreads artık birden fazla yazar/çevirmen döndürebiliyor,
        // bu yüzden tekil DTO yerine liste kullanılıyor.
        public List<AuthorsDto> Authors { get; set; } = new();
        public PublishersDto Publishers { get; set; } = new();
        public List<TranslatorsDto> Translators { get; set; } = new();
        public List<string> Genres { get; set; } = new();
        public BookPublishersDto BookPublishers { get; set; } = new();
        public string GoodreadsUrl { get; set; }
        public string KitapyurduUrl { get; set; }
    }

    public class BooksDto
    {
        public string BookName { get; set; }
        public string BookCoverImage_URL { get; set; }
        public string BookDescription { get; set; }
        public int? FirstPublishYear { get; set; }
    }

    public class AuthorsDto
    {
        public string AuthorName { get; set; }
        public string AuthorSurname { get; set; }
        public string AuthorImage_URL { get; set; }
        public string AuthorBiography { get; set; }
        public int? AuthorBirthYear { get; set; }
        public int? AuthorDeathYear { get; set; }
        public string AuthorUrl { get; set; }
    }

    public class PublishersDto
    {
        public string PublisherName { get; set; }
    }

    public class TranslatorsDto
    {
        public string TranslatorName { get; set; }
        public string TranslatorSurname { get; set; }
    }

    public class BookPublishersDto
    {
        public int? PageCount { get; set; }
        public int? PublishYear { get; set; }
        public string ISBN { get; set; }
    }
}