using HtmlAgilityPack;
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
                await ScrapeKitapyurduAsync(kitapyurduUrl, result);

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

            var authorNode = doc.DocumentNode
                .SelectSingleNode("//div[@class='pr_producers__manufacturer']//a[@class='pr_producers__link']");
            var fullAuthorName = CleanTextSingleLine(authorNode?.InnerText);

            if (!string.IsNullOrEmpty(fullAuthorName))
            {
                SplitNameSurname(fullAuthorName, out var aName, out var aSurname);
                result.Authors.AuthorName = aName;
                result.Authors.AuthorSurname = aSurname;
            }

            result.Publishers.PublisherName = CleanTextSingleLine(doc.DocumentNode
                .SelectSingleNode("//div[@class='pr_producers__publisher']//a[@class='pr_producers__link']")?.InnerText);

            string translatorFull = null;
            var rows = doc.DocumentNode.SelectNodes("//div[@class='attributes']//tr");
            if (rows != null)
            {
                foreach (var row in rows)
                {
                    var cells = row.SelectNodes("td");
                    if (cells == null || cells.Count < 2) continue;

                    var label = cells[0].InnerText.Trim();
                    var value = CleanTextSingleLine(cells[1].InnerText);

                    if (label.Contains("Çevirmen")) translatorFull = value;
                    else if (label.Contains("ISBN")) result.BookPublishers.ISBN = value;
                    else if (label.Contains("Sayfa Sayısı")) result.BookPublishers.PageCount = ParseInt(value);
                    else if (label.Contains("Yayın Tarihi")) result.BookPublishers.PublishYear = ExtractYear(value);
                }
            }

            if (!string.IsNullOrEmpty(translatorFull))
            {
                SplitNameSurname(translatorFull, out var tName, out var tSurname);
                result.Translators.TranslatorName = tName;
                result.Translators.TranslatorSurname = tSurname;
            }
        }

        // ================== GOODREADS ==================
        private async Task ScrapeGoodreadsAsync(string url, SchemaResult result)
        {
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

            var authorLinkNode = doc.DocumentNode.SelectSingleNode("//a[@class='ContributorLink']");
            var authorUrl = authorLinkNode?.GetAttributeValue("href", null);

            if (!string.IsNullOrEmpty(authorUrl))
            {
                var fullAuthorUrl = authorUrl.StartsWith("http") ? authorUrl : "https://www.goodreads.com" + authorUrl;
                var authorDoc = await GetHtmlAsync(fullAuthorUrl);

                var imgSrc = authorDoc.DocumentNode
                    .SelectSingleNode("//img[@itemprop='image']")?.GetAttributeValue("src", null);

                if (!string.IsNullOrEmpty(imgSrc))
                    result.Authors.AuthorImage_URL = Regex.Replace(imgSrc, @"p\d+/", "p8/");

                var birthRaw = authorDoc.DocumentNode.SelectSingleNode("//div[@itemprop='birthDate']")?.InnerText;
                result.Authors.AuthorBirthYear = ExtractYear(birthRaw);

                var deathRaw = authorDoc.DocumentNode.SelectSingleNode("//div[@itemprop='deathDate']")?.InnerText;
                result.Authors.AuthorDeathYear = ExtractYear(deathRaw);

                var bioNode = authorDoc.DocumentNode
                    .SelectSingleNode("//div[@class='aboutAuthorInfo']//span[starts-with(@id,'freeTextauthor')]");
                result.Authors.AuthorBiography = CleanTextParagraphs(bioNode?.InnerHtml);
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
        public AuthorsDto Authors { get; set; } = new();
        public PublishersDto Publishers { get; set; } = new();
        public TranslatorsDto Translators { get; set; } = new();
        public List<string> Genres { get; set; } = new();
        public BookPublishersDto BookPublishers { get; set; } = new();
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