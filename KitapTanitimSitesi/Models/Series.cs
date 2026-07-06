namespace KitapTanitimSitesi.Models
{
    public class Series
    {
        public int SeriesID { get; set; }
        public string SeriesName { get; set; } = string.Empty;

        public ICollection<Book> Books { get; set; } = new List<Book>();
    }
}
