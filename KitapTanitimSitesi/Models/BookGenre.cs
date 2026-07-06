namespace KitapTanitimSitesi.Models
{
    public class BookGenre
    {
        public int BookID { get; set; }
        public int GenreID { get; set; }

        public Book Book { get; set; } = null!;
        public Genre Genre { get; set; } = null!;
    }
}